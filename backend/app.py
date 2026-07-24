from __future__ import annotations

import json
import math
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime
from html.parser import HTMLParser
from urllib.error import URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import pandas as pd
from flask import Flask, jsonify, request

from notion_daily_recommendations import DailyRecommendationError, fetch_daily_recommendations, parse_date_range


LA_TZ = ZoneInfo("America/Los_Angeles")
MAX_STRATEGIES = 5
CAPE_HISTORY_URL = "https://www.multpl.com/shiller-pe/table/by-month"
CAPE_CACHE_TTL_SECONDS = 24 * 60 * 60


app = Flask(__name__)
_cape_cache: tuple[float, pd.DataFrame] | None = None


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response


@dataclass(frozen=True)
class AssetBars:
    symbol: str
    frame: pd.DataFrame


class StrategyConfigError(ValueError):
    def __init__(self, path: str, code: str, message: str):
        super().__init__(message)
        self.path = path
        self.code = code
        self.message = message

    def as_dict(self) -> dict:
        return {"code": self.code, "path": self.path, "message": self.message}


class TableCellParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.cells: list[str] = []
        self._inside_cell = False
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs):
        if tag.lower() == "td":
            self._inside_cell = True
            self._parts = []

    def handle_data(self, data: str):
        if self._inside_cell:
            self._parts.append(data)

    def handle_endtag(self, tag: str):
        if tag.lower() == "td" and self._inside_cell:
            self.cells.append(" ".join("".join(self._parts).split()))
            self._inside_cell = False


def parse_cape_history_html(html: str) -> pd.DataFrame:
    parser = TableCellParser()
    parser.feed(html)
    records = []
    for index in range(len(parser.cells) - 1):
        date = pd.to_datetime(parser.cells[index], errors="coerce")
        value_match = re.fullmatch(r"\s*([0-9]+(?:\.[0-9]+)?)\s*", parser.cells[index + 1])
        if pd.notna(date) and value_match:
            records.append({"date": date.normalize(), "cape": float(value_match.group(1))})
    frame = pd.DataFrame.from_records(records)
    if frame.empty:
        raise RuntimeError("CAPE source returned no usable monthly observations")
    return frame.drop_duplicates("date").sort_values("date").reset_index(drop=True)


def fetch_cape_history() -> pd.DataFrame:
    global _cape_cache
    now = time.monotonic()
    if _cape_cache and now - _cape_cache[0] < CAPE_CACHE_TTL_SECONDS:
        return _cape_cache[1].copy()

    request_obj = Request(CAPE_HISTORY_URL, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"})
    try:
        with urlopen(request_obj, timeout=30) as response:
            frame = parse_cape_history_html(response.read().decode("utf-8"))
    except (URLError, TimeoutError) as exc:
        raise RuntimeError(f"CAPE request failed: {exc}") from exc
    _cape_cache = (now, frame)
    return frame.copy()


def attach_cape_history(df: pd.DataFrame, cape_history: pd.DataFrame) -> pd.DataFrame:
    delayed = cape_history.copy()
    delayed["available_date"] = delayed["date"] + pd.offsets.MonthBegin(1)
    delayed = delayed[["available_date", "cape"]].sort_values("available_date")
    aligned = pd.merge_asof(
        df.sort_values("date"),
        delayed,
        left_on="date",
        right_on="available_date",
        direction="backward",
    )
    if aligned["cape"].isna().all():
        raise ValueError("CAPE data does not overlap the selected backtest range")
    return aligned.drop(columns=["available_date"]).reset_index(drop=True)


def yahoo_chart_url(symbol: str, range_: str) -> str:
    return f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range={range_}&includePrePost=false&events=div%2Csplits"


def fetch_yahoo_history(symbol: str, range_: str = "20y") -> AssetBars:
    request_obj = Request(
        yahoo_chart_url(symbol, range_),
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    try:
        with urlopen(request_obj, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError) as exc:
        raise RuntimeError(f"Yahoo request failed for {symbol}: {exc}") from exc

    result = payload.get("chart", {}).get("result", [None])[0]
    if not result:
        raise RuntimeError(f"Yahoo returned no chart data for {symbol}")

    timestamps = result.get("timestamp") or []
    quote = result.get("indicators", {}).get("quote", [{}])[0]
    records = []
    for ts, open_, close_ in zip(timestamps, quote.get("open", []), quote.get("close", [])):
        if close_ is None:
            continue
        records.append(
            {
                "date": pd.to_datetime(datetime.utcfromtimestamp(ts)).normalize(),
                "open": float(open_) if open_ is not None else float(close_),
                "close": float(close_),
            }
        )

    frame = pd.DataFrame.from_records(records)
    if frame.empty:
        raise RuntimeError(f"Yahoo returned no usable bars for {symbol}")
    return AssetBars(symbol=symbol, frame=frame.drop_duplicates("date").sort_values("date").reset_index(drop=True))


def parse_date(value: str | None) -> pd.Timestamp | None:
    if not value:
        return None
    return pd.to_datetime(value).normalize()


def normalize_symbol(value: str | None, fallback: str) -> str:
    symbol = (value or fallback).strip().upper()
    return "CASH" if symbol in {"", "CASH"} else symbol


def finite(value: float | int | None) -> float | None:
    if value is None:
        return None
    value = float(value)
    return value if math.isfinite(value) else None


def pct(value: float | None) -> float | None:
    return None if value is None else round(value * 100, 2)


def compute_macd(close: pd.Series, fast: int, slow: int, signal: int) -> pd.DataFrame:
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd = ema_fast - ema_slow
    signal_line = macd.ewm(span=signal, adjust=False).mean()
    return pd.DataFrame({"macd": macd, "signal": signal_line, "hist": macd - signal_line})


def moving_average(close: pd.Series, window: int, ma_type: str) -> pd.Series:
    return close.ewm(span=window, adjust=False).mean() if ma_type == "ema" else close.rolling(window).mean()


def date_range_for_payload(payload: dict) -> str:
    start_date = parse_date(payload.get("startDate"))
    end_date = parse_date(payload.get("endDate"))
    if not start_date:
        return "20y"
    years = max(2, math.ceil(((end_date or pd.Timestamp.now()).normalize() - start_date).days / 365.25) + 1)
    return f"{min(years, 30)}y"


def collect_required_symbols(payload: dict) -> list[str]:
    symbols = {normalize_symbol(payload.get("benchmark"), "QQQ")}
    for strategy in payload.get("strategies", []):
        symbols.add(normalize_symbol(strategy.get("signalAsset"), "QQQ"))
        symbols.add(normalize_symbol(strategy.get("riskAsset"), "QLD"))
        fallback = normalize_symbol(strategy.get("fallbackAsset"), "QQQ")
        if fallback != "CASH":
            symbols.add(fallback)
    return sorted(symbol for symbol in symbols if symbol != "CASH")


def strategy_uses_cape(strategy: dict) -> bool:
    return bool(strategy.get("riskFilter", {}).get("cape", {}).get("enabled"))


def cape_filter_config(strategy: dict) -> tuple[bool, float]:
    cape = strategy.get("riskFilter", {}).get("cape", {})
    enabled = bool(cape.get("enabled"))
    maximum = float(cape.get("max", 30))
    if enabled and (not math.isfinite(maximum) or maximum <= 0):
        raise ValueError("CAPE maximum must be a positive number")
    return enabled, maximum


def build_aligned_frame(assets: dict[str, AssetBars], start_date: pd.Timestamp | None, end_date: pd.Timestamp | None) -> tuple[pd.DataFrame, list[dict]]:
    aligned = None
    audit = []
    for symbol, bars in assets.items():
        frame = bars.frame.copy()
        if start_date is not None:
            frame = frame[frame["date"] >= start_date]
        if end_date is not None:
            frame = frame[frame["date"] <= end_date]
        audit.append(
            {
                "symbol": symbol,
                "startDate": frame["date"].iloc[0].date().isoformat() if not frame.empty else None,
                "endDate": frame["date"].iloc[-1].date().isoformat() if not frame.empty else None,
                "rows": int(len(frame)),
            }
        )
        renamed = frame.rename(columns={"open": f"{symbol}_open", "close": f"{symbol}_close"})
        aligned = renamed if aligned is None else aligned.merge(renamed, on="date", how="inner")

    if aligned is None or aligned.empty:
        raise ValueError("No overlapping data across selected assets")
    return aligned.sort_values("date").reset_index(drop=True), audit


def strategy_name(strategy: dict, index: int) -> str:
    return (strategy.get("name") or f"Strategy {index + 1}").strip()


def normalize_rule_group(group: dict | None, default_type: str, default_logic: str = "and") -> dict:
    group = group or {}
    rules = group.get("rules")
    if isinstance(rules, list) and rules:
        return {"logic": str(group.get("logic", default_logic)).lower(), "rules": rules}

    rule = {key: value for key, value in group.items() if key not in {"logic", "rules", "requirePositiveHist"}}
    rule["type"] = rule.get("type", default_type)
    normalized_rules = [rule]
    if group.get("requirePositiveHist"):
        normalized_rules.append({"type": "hist_positive"})
    return {"logic": str(group.get("logic", default_logic)).lower(), "rules": normalized_rules}


def normalize_post_exit_reentry(strategy: dict) -> dict:
    version = strategy.get("configVersion", 1)
    if not isinstance(version, int) or version > 2:
        raise StrategyConfigError("configVersion", "UNSUPPORTED_CONFIG_VERSION", "Unsupported strategy config version")
    source = strategy.get("postExitReentry")
    if not source or not bool(source.get("enabled")):
        return {"schemaVersion": 1, "enabled": False}
    policy = {
        "schemaVersion": 1,
        "enabled": True,
        "cooldownTradingDays": source.get("cooldownTradingDays"),
        "signalHandling": source.get("signalHandling", "ignore"),
        "retentionTradingDays": source.get("retentionTradingDays"),
        "releaseValidation": source.get("releaseValidation") or {"mode": "revalidate_entry"},
    }
    validate_trading_days(policy["cooldownTradingDays"], "postExitReentry.cooldownTradingDays")
    if policy["signalHandling"] not in {"ignore", "retain_latest"}:
        raise StrategyConfigError("postExitReentry.signalHandling", "INVALID_SIGNAL_HANDLING", "Signal handling must be ignore or retain_latest")
    if policy["signalHandling"] == "ignore":
        return policy
    validate_trading_days(policy["retentionTradingDays"], "postExitReentry.retentionTradingDays")
    validation = policy["releaseValidation"]
    if validation.get("mode") not in {"signal_still_valid", "revalidate_entry", "rule_group"}:
        raise StrategyConfigError("postExitReentry.releaseValidation.mode", "INVALID_RELEASE_MODE", "Unsupported release validation mode")
    if validation.get("mode") == "rule_group":
        rules = validation.get("group", {}).get("rules")
        if not isinstance(rules, list) or not rules:
            raise StrategyConfigError("postExitReentry.releaseValidation.group.rules", "EMPTY_RELEASE_RULES", "At least one release rule is required")
        allowed = {"macd_above_signal", "macd_below_signal", "hist_positive", "hist_negative", "close_above_ma", "close_below_ma", "close_above_prior_high", "close_below_prior_low"}
        for index, rule in enumerate(rules):
            base = f"postExitReentry.releaseValidation.group.rules[{index}]"
            if rule.get("assetRole") not in {"signal", "risk", "fallback"}:
                raise StrategyConfigError(f"{base}.assetRole", "INVALID_ASSET_ROLE", "Unsupported asset role")
            if rule.get("assetRole") == "fallback" and normalize_symbol(strategy.get("fallbackAsset"), "QQQ") == "CASH":
                raise StrategyConfigError(f"{base}.assetRole", "CASH_RULE_UNSUPPORTED", "CASH cannot be used by price rules")
            if rule.get("type") not in allowed:
                raise StrategyConfigError(f"{base}.type", "INVALID_RELEASE_RULE", "Unsupported release rule")
            if rule.get("type") in {"close_above_ma", "close_below_ma", "close_above_prior_high", "close_below_prior_low"}:
                validate_trading_days(rule.get("window"), f"{base}.window")
            if rule.get("type") in {"macd_above_signal", "macd_below_signal", "hist_positive", "hist_negative"}:
                for field in ("fast", "slow", "signal"):
                    validate_trading_days(rule.get(field), f"{base}.{field}")
    return policy


def validate_trading_days(value, path: str):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1 or value > 252:
        raise StrategyConfigError(path, "INVALID_TRADING_DAYS", "Enter an integer from 1 to 252 trading days")


def entry_macd_defaults(strategy: dict) -> dict:
    entry_group = normalize_rule_group(strategy.get("entry"), "macd_cross")
    for rule in entry_group["rules"]:
        if rule.get("type") == "macd_cross":
            return {
                "fast": int(rule.get("fast", 12)),
                "slow": int(rule.get("slow", 26)),
                "signal": int(rule.get("signal", 9)),
            }
    return {"fast": 12, "slow": 26, "signal": 9}


def evaluate_rule(signal_close: pd.Series, rule: dict, strategy: dict, side: str) -> tuple[str, pd.Series, object, dict]:
    rule_type = rule.get("type", "macd_cross" if side == "entry" else "ma_break")
    metadata = {}

    if rule_type == "price_above_ma":
        window = int(rule.get("window", 50))
        ma_type = rule.get("maType", "ema")
        ma = moving_average(signal_close, window, ma_type)
        signal = (signal_close > ma) & (signal_close.shift(1) <= ma.shift(1))
        latest_ma = finite(ma.iloc[-1])
        label = f"Close crosses above {ma_type.upper()}{window}"
        value = f"{finite(signal_close.iloc[-1])} > {round(latest_ma, 4) if latest_ma is not None else None}"
        return label, signal, value, {"primaryLabel": label, "primaryPassed": bool(signal.iloc[-1])}

    if rule_type == "price_breakout":
        window = int(rule.get("window", 20))
        previous_high = signal_close.shift(1).rolling(window).max()
        previous_previous_high = signal_close.shift(2).rolling(window).max()
        signal = (signal_close > previous_high) & (signal_close.shift(1) <= previous_previous_high)
        latest_high = finite(previous_high.iloc[-1])
        label = f"Close > prior {window}D high"
        value = f"{finite(signal_close.iloc[-1])} > {round(latest_high, 4) if latest_high is not None else None}"
        return label, signal, value, {"primaryLabel": label, "primaryPassed": bool(signal.iloc[-1])}

    if rule_type == "macd_cross_down":
        defaults = entry_macd_defaults(strategy)
        fast = int(rule.get("fast", defaults["fast"]))
        slow = int(rule.get("slow", defaults["slow"]))
        signal_period = int(rule.get("signal", defaults["signal"]))
        macd = compute_macd(signal_close, fast, slow, signal_period)
        signal = (macd["macd"] < macd["signal"]) & (macd["macd"].shift(1) >= macd["signal"].shift(1))
        label = f"MACD({fast},{slow},{signal_period}) death cross"
        metadata.update(
            {
                "latestMacd": finite(macd["macd"].iloc[-1]),
                "latestSignal": finite(macd["signal"].iloc[-1]),
                "latestHist": finite(macd["hist"].iloc[-1]),
                "primaryLabel": label,
                "primaryPassed": bool(signal.iloc[-1]),
            }
        )
        return label, signal, "cross down", metadata

    if rule_type == "price_breakdown":
        window = int(rule.get("window", 20))
        previous_low = signal_close.shift(1).rolling(window).min()
        previous_previous_low = signal_close.shift(2).rolling(window).min()
        signal = (signal_close < previous_low) & (signal_close.shift(1) >= previous_previous_low)
        latest_low = finite(previous_low.iloc[-1])
        label = f"Close < prior {window}D low"
        value = f"{finite(signal_close.iloc[-1])} < {round(latest_low, 4) if latest_low is not None else None}"
        return label, signal, value, {"primaryLabel": label, "primaryPassed": bool(signal.iloc[-1])}

    if rule_type == "hist_positive":
        defaults = entry_macd_defaults(strategy)
        fast = int(rule.get("fast", defaults["fast"]))
        slow = int(rule.get("slow", defaults["slow"]))
        signal_period = int(rule.get("signal", defaults["signal"]))
        macd = compute_macd(signal_close, fast, slow, signal_period)
        signal = macd["hist"] > 0
        label = "Hist > 0"
        metadata.update(
            {
                "latestMacd": finite(macd["macd"].iloc[-1]),
                "latestSignal": finite(macd["signal"].iloc[-1]),
                "latestHist": finite(macd["hist"].iloc[-1]),
                "histPositive": bool(signal.iloc[-1]),
            }
        )
        return label, signal, finite(macd["hist"].iloc[-1]), metadata

    if rule_type == "macd_cross":
        fast = int(rule.get("fast", 12))
        slow = int(rule.get("slow", 26))
        signal_period = int(rule.get("signal", 9))
        macd = compute_macd(signal_close, fast, slow, signal_period)
        signal = (macd["macd"] > macd["signal"]) & (macd["macd"].shift(1) <= macd["signal"].shift(1))
        label = f"MACD({fast},{slow},{signal_period}) golden cross"
        metadata.update(
            {
                "latestMacd": finite(macd["macd"].iloc[-1]),
                "latestSignal": finite(macd["signal"].iloc[-1]),
                "latestHist": finite(macd["hist"].iloc[-1]),
                "primaryLabel": label,
                "primaryPassed": bool(signal.iloc[-1]),
            }
        )
        return label, signal, "cross up", metadata

    if rule_type != "ma_break":
        raise StrategyConfigError(f"{side}.rules", "INVALID_EVENT_RULE", f"Unsupported {side} rule: {rule_type}")
    window = int(rule.get("window", 15))
    ma_type = rule.get("maType", "ema")
    ma = moving_average(signal_close, window, ma_type)
    signal = signal_close < ma
    latest_ma = finite(ma.iloc[-1])
    label = f"Close < {ma_type.upper()}{window}"
    value = f"{finite(signal_close.iloc[-1])} < {round(latest_ma, 4) if latest_ma is not None else None}"
    metadata.update(
        {
            "maLabel": f"{ma_type.upper()}{window}",
            "latestMa": latest_ma,
            "primaryLabel": label,
            "primaryPassed": bool(signal.iloc[-1]),
        }
    )
    return label, signal, value, metadata


def build_rule_group_signal(signal_close: pd.Series, strategy: dict, side: str) -> tuple[pd.Series, dict]:
    default_type = "macd_cross" if side == "entry" else "ma_break"
    group = normalize_rule_group(strategy.get(side), default_type)
    logic = group["logic"] if group["logic"] in {"and", "or"} else "and"
    conditions: list[tuple[str, pd.Series, object]] = []
    diagnostics = {
        "logic": logic.upper(),
        "requirePositiveHist": False,
        "latestHist": None,
        "histPositive": False,
        "primaryPassed": False,
        "primaryLabel": "Entry signal" if side == "entry" else "Exit signal",
    }

    for index, rule in enumerate(group["rules"]):
        label, condition, value, metadata = evaluate_rule(signal_close, rule, strategy, side)
        conditions.append((label, condition, value))
        diagnostics.update({key: value for key, value in metadata.items() if value is not None})
        if index == 0:
            diagnostics["primaryLabel"] = metadata.get("primaryLabel", label)
            diagnostics["primaryPassed"] = bool(condition.iloc[-1])
        if rule.get("type") == "hist_positive":
            diagnostics["requirePositiveHist"] = True

    group_signal = conditions[0][1] if conditions else pd.Series(False, index=signal_close.index)
    for _, condition, _ in conditions[1:]:
        group_signal = group_signal | condition if logic == "or" else group_signal & condition
    diagnostics["conditions"] = [
        {"label": label, "value": value, "passed": bool(condition.iloc[-1])}
        for label, condition, value in conditions
    ]
    diagnostics["exitPassed" if side == "exit" else "entryPassed"] = bool(group_signal.iloc[-1])
    return group_signal.fillna(False), diagnostics


def build_entry_signal(df: pd.DataFrame, signal_close: pd.Series, strategy: dict) -> pd.Series:
    entry_signal, _ = build_rule_group_signal(signal_close, strategy, "entry")
    return entry_signal


def build_exit_signal(signal_close: pd.Series, strategy: dict) -> tuple[pd.Series, dict]:
    return build_rule_group_signal(signal_close, strategy, "exit")


def evaluate_state_rule(df: pd.DataFrame, strategy: dict, rule: dict, idx: int) -> dict:
    role = rule["assetRole"]
    asset = {
        "signal": normalize_symbol(strategy.get("signalAsset"), "QQQ"),
        "risk": normalize_symbol(strategy.get("riskAsset"), "QLD"),
        "fallback": normalize_symbol(strategy.get("fallbackAsset"), "QQQ"),
    }[role]
    close = df[f"{asset}_close"].iloc[: idx + 1]
    kind = rule["type"]
    passed = False
    value = None
    label = kind
    if kind.startswith("macd_") or kind.startswith("hist_"):
        macd = compute_macd(close, int(rule["fast"]), int(rule["slow"]), int(rule["signal"]))
        if kind == "macd_above_signal":
            value, passed = finite(macd["macd"].iloc[-1] - macd["signal"].iloc[-1]), bool(macd["macd"].iloc[-1] > macd["signal"].iloc[-1])
        elif kind == "macd_below_signal":
            value, passed = finite(macd["macd"].iloc[-1] - macd["signal"].iloc[-1]), bool(macd["macd"].iloc[-1] < macd["signal"].iloc[-1])
        elif kind == "hist_positive":
            value, passed = finite(macd["hist"].iloc[-1]), bool(macd["hist"].iloc[-1] > 0)
        else:
            value, passed = finite(macd["hist"].iloc[-1]), bool(macd["hist"].iloc[-1] < 0)
    elif kind in {"close_above_ma", "close_below_ma"}:
        ma = moving_average(close, int(rule["window"]), rule.get("maType", "ema"))
        value = {"close": finite(close.iloc[-1]), "average": finite(ma.iloc[-1])}
        passed = bool(close.iloc[-1] > ma.iloc[-1]) if kind == "close_above_ma" else bool(close.iloc[-1] < ma.iloc[-1])
    else:
        window = int(rule["window"])
        prior = close.shift(1).rolling(window)
        threshold = prior.max().iloc[-1] if kind == "close_above_prior_high" else prior.min().iloc[-1]
        value = {"close": finite(close.iloc[-1]), "threshold": finite(threshold)}
        passed = bool(close.iloc[-1] > threshold) if kind == "close_above_prior_high" else bool(close.iloc[-1] < threshold)
    return {"label": label, "value": value, "passed": passed}


def evaluate_release_validation(df: pd.DataFrame, strategy: dict, policy: dict, idx: int, entry_signal: pd.Series) -> tuple[bool, dict]:
    validation = policy["releaseValidation"]
    mode = validation["mode"]
    if mode == "signal_still_valid":
        return True, {"mode": mode, "logic": None, "passed": True, "conditions": []}
    if mode == "revalidate_entry":
        passed = bool(entry_signal.iloc[idx])
        return passed, {"mode": mode, "logic": None, "passed": passed, "conditions": []}
    group = validation["group"]
    snapshots = [evaluate_state_rule(df, strategy, rule, idx) for rule in group["rules"]]
    logic = str(group.get("logic", "and")).lower()
    passed = any(item["passed"] for item in snapshots) if logic == "or" else all(item["passed"] for item in snapshots)
    return passed, {"mode": mode, "logic": logic.upper(), "passed": passed, "conditions": snapshots}


def asset_gross(df: pd.DataFrame, idx: int, asset: str) -> float:
    if asset == "CASH":
        return 1.0
    prev_close = float(df.at[idx - 1, f"{asset}_close"])
    close = float(df.at[idx, f"{asset}_close"])
    return close / prev_close if prev_close else 1.0


def switch_gross(df: pd.DataFrame, idx: int, from_asset: str, to_asset: str) -> float:
    if from_asset == to_asset:
        return asset_gross(df, idx, from_asset)
    overnight = 1.0 if from_asset == "CASH" else float(df.at[idx, f"{from_asset}_open"]) / float(df.at[idx - 1, f"{from_asset}_close"])
    intraday = 1.0 if to_asset == "CASH" else float(df.at[idx, f"{to_asset}_close"]) / float(df.at[idx, f"{to_asset}_open"])
    return overnight * intraday


def summarize_returns(name: str, values: list[float], dates: pd.Series, switches: int) -> dict:
    equity = pd.Series(values, index=pd.to_datetime(dates))
    returns = equity.pct_change().fillna(0.0)
    years = max(len(equity) / 252.0, 1 / 252.0)
    total_return = float(equity.iloc[-1] - 1.0)
    cagr = float(equity.iloc[-1] ** (1.0 / years) - 1.0)
    drawdown = equity / equity.cummax() - 1.0
    vol = float(returns.std(ddof=0) * math.sqrt(252))
    sharpe = float((returns.mean() * 252) / vol) if vol else 0.0
    return {
        "name": name,
        "totalReturnPct": pct(total_return),
        "cagrPct": pct(cagr),
        "maxDrawdownPct": pct(float(drawdown.min())),
        "annualVolPct": pct(vol),
        "sharpe": round(sharpe, 2),
        "switches": switches,
    }


def run_strategy(df: pd.DataFrame, strategy: dict, index: int, benchmark_summary: dict, signal_overrides: dict | None = None) -> dict:
    name = strategy_name(strategy, index)
    signal_asset = normalize_symbol(strategy.get("signalAsset"), "QQQ")
    risk_asset = normalize_symbol(strategy.get("riskAsset"), "QLD")
    fallback_asset = normalize_symbol(strategy.get("fallbackAsset"), signal_asset)
    signal_close = df[f"{signal_asset}_close"]
    entry_signal = build_entry_signal(df, signal_close, strategy)
    exit_signal, diagnostics = build_exit_signal(signal_close, strategy)
    if signal_overrides is not None:
        entry_signal = pd.Series(signal_overrides["entry"], index=df.index, dtype=bool)
        exit_signal = pd.Series(signal_overrides["exit"], index=df.index, dtype=bool)
    policy = normalize_post_exit_reentry(strategy)
    cape_enabled, cape_maximum = cape_filter_config(strategy)
    if cape_enabled and "cape" not in df:
        raise ValueError("CAPE data is required by the selected risk filter")
    cape_permitted = (
        (df["cape"].notna() & (df["cape"] <= cape_maximum))
        if cape_enabled
        else pd.Series(True, index=df.index)
    )

    held = fallback_asset
    pending: dict | None = None
    base_risk_on = False
    values = [1.0]
    trades = []
    events = []
    switches = 0
    event_sequence = 0
    cooldown_start_index = None
    cooldown_start_date = None
    deferred = None
    release_snapshot = None
    counters = {"deferredEntries": 0, "expiredSignals": 0, "rejectedSignals": 0}

    def event(event_type: str, idx: int, **fields):
        nonlocal event_sequence
        event_sequence += 1
        events.append({
            "sequence": event_sequence,
            "eventDate": df.at[idx, "date"].date().isoformat(),
            "eventType": event_type,
            "holding": held,
            "cooldownProgress": None if cooldown_start_index is None else {
                "elapsed": max(0, idx - cooldown_start_index),
                "total": policy.get("cooldownTradingDays"),
            },
            **fields,
        })

    for idx in range(1, len(df)):
        if pending is None:
            gross = asset_gross(df, idx, held)
        else:
            old = held
            target = pending["targetAsset"]
            gross = switch_gross(df, idx, old, target)
            held = target
            order = pending
            pending = None
            switches += 1
            trades.append(
                {
                    "signalDate": order["sourceSignalDate"],
                    "sourceSignalDate": order["sourceSignalDate"],
                    "releaseDate": order.get("releaseDate"),
                    "orderScheduledDate": order["scheduledDate"],
                    "executionDate": df.at[idx, "date"].date().isoformat(),
                    "executionPrice": None if held == "CASH" else finite(df.at[idx, f"{held}_open"]),
                    "executionDeferred": False,
                    "deferred": bool(order.get("releaseDate")),
                    "from": old,
                    "to": held,
                    "reason": order["reason"],
                    "equityAfterTrade": round(values[-1] * gross, 4),
                }
            )
            event("Entry Executed" if held == risk_asset else "Exit Executed", idx, signalDate=order["sourceSignalDate"], releaseDate=order.get("releaseDate"))
            if policy["enabled"] and order["kind"] == "exit" and old == risk_asset and held == fallback_asset:
                cooldown_start_index = idx
                cooldown_start_date = df.at[idx, "date"].date().isoformat()
                deferred = None
                event("Cooldown Started", idx, signalDate=order["sourceSignalDate"])

        values.append(values[-1] * gross)

        entry_today = bool(entry_signal.iloc[idx])
        exit_today = bool(exit_signal.iloc[idx])
        if base_risk_on and exit_today and held == risk_asset:
            base_risk_on = False
            if pending is None:
                pending = {
                    "targetAsset": fallback_asset, "kind": "exit", "reason": "Exit signal",
                    "sourceSignalDate": df.at[idx, "date"].date().isoformat(),
                    "scheduledDate": df.at[idx, "date"].date().isoformat(), "releaseDate": None,
                }
                event("Order Scheduled", idx, signalDate=pending["sourceSignalDate"], releaseDate=None)

        cooling = policy["enabled"] and cooldown_start_index is not None and idx - cooldown_start_index < policy["cooldownTradingDays"]
        release_day = policy["enabled"] and cooldown_start_index is not None and idx - cooldown_start_index == policy["cooldownTradingDays"]

        if deferred is not None and idx > deferred["validThroughIndex"]:
            event("Signal Expired", idx, signalDate=deferred["signalDate"], validThrough=deferred["validThroughDate"])
            counters["expiredSignals"] += 1
            deferred = None

        release_sources = []
        if release_day and deferred is not None:
            passed, release_snapshot = evaluate_release_validation(df, strategy, policy, idx, entry_signal)
            if passed:
                base_risk_on = True
                pending = {
                    "targetAsset": risk_asset, "kind": "entry", "reason": "Deferred entry signal",
                    "sourceSignalDate": deferred["signalDate"], "releaseDate": df.at[idx, "date"].date().isoformat(),
                    "scheduledDate": df.at[idx, "date"].date().isoformat(),
                }
                event("Release Passed", idx, signalDate=deferred["signalDate"], releaseDate=pending["releaseDate"], ruleSnapshot=release_snapshot["conditions"])
                release_sources.append(deferred["signalDate"])
                event("Order Scheduled", idx, signalDate=deferred["signalDate"], releaseDate=pending["releaseDate"])
                deferred["status"] = "released"
            else:
                event("Release Rejected", idx, signalDate=deferred["signalDate"], releaseDate=df.at[idx, "date"].date().isoformat(), ruleSnapshot=release_snapshot["conditions"])
                counters["rejectedSignals"] += 1
            deferred = None

        if entry_today and pending is not None and pending.get("releaseDate"):
            pending["sourceSignalDates"] = [*release_sources, df.at[idx, "date"].date().isoformat()]
            events[-1]["sourceSignalDates"] = pending["sourceSignalDates"]
        elif (
            entry_today
            and not base_risk_on
            and not (pending is not None and pending.get("kind") == "exit")
        ):
            signal_date = df.at[idx, "date"].date().isoformat()
            if cooling:
                if policy["signalHandling"] == "ignore":
                    event("Entry Ignored", idx, signalDate=signal_date)
                else:
                    retention = policy["retentionTradingDays"]
                    valid_index = idx + retention - 1
                    next_deferred = {
                        "signalDate": signal_date,
                        "signalIndex": idx,
                        "validThroughIndex": valid_index,
                        "validThroughDate": df.at[valid_index, "date"].date().isoformat() if valid_index < len(df) else None,
                        "validThroughOutOfRange": valid_index >= len(df),
                        "status": "retained",
                        "ruleSnapshot": [],
                    }
                    event_type = "Signal Replaced" if deferred is not None else "Signal Retained"
                    event(event_type, idx, signalDate=signal_date, validThrough=next_deferred["validThroughDate"])
                    deferred = next_deferred
                    counters["deferredEntries"] += 1
            else:
                base_risk_on = True
                entry_target = risk_asset if bool(cape_permitted.iloc[idx]) else fallback_asset
                if pending is None and held != entry_target:
                    pending = {
                        "targetAsset": entry_target,
                        "kind": "entry" if entry_target == risk_asset else "risk_filter",
                        "reason": "Entry signal" if entry_target == risk_asset else "CAPE risk filter",
                        "sourceSignalDate": signal_date, "scheduledDate": signal_date, "releaseDate": None,
                    }
                    event("Order Scheduled", idx, signalDate=signal_date, releaseDate=None)

        if cape_enabled and base_risk_on and pending is None:
            target = risk_asset if bool(cape_permitted.iloc[idx]) else fallback_asset
            if target != held:
                pending = {
                    "targetAsset": target, "kind": "risk_filter",
                    "reason": "CAPE risk filter" if target == fallback_asset else "CAPE risk filter cleared",
                    "sourceSignalDate": df.at[idx, "date"].date().isoformat(),
                    "scheduledDate": df.at[idx, "date"].date().isoformat(), "releaseDate": None,
                }
                event("Order Scheduled", idx, signalDate=pending["sourceSignalDate"], releaseDate=None)

    summary = summarize_returns(name, values, df["date"], switches)
    summary["winVsBenchmark"] = (summary["cagrPct"] or -999) > (benchmark_summary.get("cagrPct") or -999)
    summary["currentHolding"] = pending["targetAsset"] if pending else held
    summary["actualHolding"] = held
    summary.update(counters)
    summary["latestSignal"] = "SWITCH" if pending else "HOLD"
    summary["rank"] = None
    latest_close = finite(signal_close.iloc[-1])
    latest_conditions = diagnostics["conditions"].copy()
    latest_conditions.append({"label": "Full exit signal", "value": diagnostics["logic"], "passed": bool(exit_signal.iloc[-1])})
    if cape_enabled:
        latest_cape = finite(df["cape"].iloc[-1])
        latest_conditions.append(
            {
                "label": f"CAPE <= {cape_maximum:g}",
                "value": round(latest_cape, 2) if latest_cape is not None else None,
                "passed": bool(cape_permitted.iloc[-1]),
            }
        )

    return {
        "id": strategy.get("id") or f"strategy-{index + 1}",
        "summary": summary,
        "equityCurve": [
            {"date": date.date().isoformat(), "value": round(value, 4)}
            for date, value in zip(pd.to_datetime(df["date"]), values)
        ],
        "status": "complete",
        "trades": trades,
        "events": events,
        "latestSignal": {
            "holding": pending["targetAsset"] if pending else held,
            "actualHolding": held,
            "nextTarget": pending["targetAsset"] if pending else held,
            "action": "SWITCH" if pending else "HOLD",
            "conditions": latest_conditions,
            "explanation": explain_latest_signal(signal_asset, risk_asset, fallback_asset, pending["targetAsset"] if pending else held, pending["targetAsset"] if pending else None, diagnostics, latest_close),
            "postExitReentry": {
                "enabled": policy["enabled"],
                "state": "order_pending" if pending and pending.get("releaseDate") else (
                    "pending_signal" if deferred else (
                        "cooling_down" if policy["enabled"] and cooldown_start_index is not None and len(df) - 1 - cooldown_start_index < policy["cooldownTradingDays"] else "inactive"
                    )
                ),
                "cooldownStartDate": cooldown_start_date,
                "cooldownElapsed": None if cooldown_start_index is None else len(df) - 1 - cooldown_start_index,
                "cooldownTotal": policy.get("cooldownTradingDays"),
                "earliestReleaseDate": (
                    df.at[cooldown_start_index + policy["cooldownTradingDays"], "date"].date().isoformat()
                    if cooldown_start_index is not None and cooldown_start_index + policy["cooldownTradingDays"] < len(df) else None
                ),
                "earliestReleaseOutOfRange": bool(cooldown_start_index is not None and cooldown_start_index + policy["cooldownTradingDays"] >= len(df)),
                "deferredSignal": deferred,
                "releaseValidation": release_snapshot,
                "pendingOrder": pending,
                "nextAction": "execute_next_available_open" if pending else ("wait_for_release" if deferred else "follow_normal_rules"),
            },
        },
    }


def explain_latest_signal(signal_asset: str, risk_asset: str, fallback_asset: str, holding: str, pending: str | None, diagnostics: dict, latest_close: float | None) -> str:
    if pending:
        return f"Latest signal schedules a switch to {pending} at the next open."
    if holding == risk_asset:
        if diagnostics["primaryPassed"] and diagnostics["requirePositiveHist"] and not diagnostics["histPositive"]:
            return f"{signal_asset} triggered {diagnostics['primaryLabel']}, but Hist is not positive, so the full exit condition is not met."
        return f"The strategy remains in {risk_asset}; the configured exit group is not fully triggered."
    return f"The strategy remains in {holding or fallback_asset}; no entry signal is active on the latest completed bar."


def build_benchmark(df: pd.DataFrame, benchmark: str) -> dict:
    close = df[f"{benchmark}_close"]
    values = (close / close.iloc[0]).tolist()
    summary = summarize_returns(f"{benchmark} Buy & Hold", values, df["date"], 0)
    summary["winVsBenchmark"] = None
    summary["currentHolding"] = benchmark
    summary["latestSignal"] = "HOLD"
    summary["rank"] = None
    return {
        "summary": summary,
        "equityCurve": [
            {"date": date.date().isoformat(), "value": round(value, 4)}
            for date, value in zip(pd.to_datetime(df["date"]), values)
        ],
    }


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "backtest-backend"})


@app.get("/api/daily-recommendations")
def daily_recommendations():
    token = os.getenv("NOTION_TOKEN")
    database_id = os.getenv("NOTION_DATABASE_ID")
    if not token or not database_id:
        return jsonify({"error": "NOTION_UNCONFIGURED", "message": "Notion token or database id is not configured."}), 503
    try:
        date_range = parse_date_range(request.args.get("from"), request.args.get("to"))
        return jsonify(fetch_daily_recommendations(database_id, token, date_range))
    except DailyRecommendationError as exc:
        return jsonify({"error": exc.code, "message": exc.message}), exc.status


@app.post("/api/backtests")
def backtests():
    payload = request.get_json(force=True) or {}
    strategies = payload.get("strategies") or []
    if not strategies:
        return jsonify({"error": "At least one strategy is required"}), 400
    if len(strategies) > MAX_STRATEGIES:
        return jsonify({"error": f"At most {MAX_STRATEGIES} strategies can be compared"}), 400

    start_date = parse_date(payload.get("startDate"))
    end_date = parse_date(payload.get("endDate"))
    benchmark = normalize_symbol(payload.get("benchmark"), "QQQ")
    range_ = date_range_for_payload(payload)
    try:
        assets = {symbol: fetch_yahoo_history(symbol, range_) for symbol in collect_required_symbols(payload)}
        df, audit = build_aligned_frame(assets, start_date, end_date)
        if any(strategy_uses_cape(strategy) for strategy in strategies):
            cape_history = fetch_cape_history()
            df = attach_cape_history(df, cape_history)
            audit.append(
                {
                    "symbol": "CAPE",
                    "startDate": cape_history["date"].iloc[0].date().isoformat(),
                    "endDate": cape_history["date"].iloc[-1].date().isoformat(),
                    "rows": int(len(cape_history)),
                }
            )
        if len(df) < 80:
            return jsonify({"error": "Aligned data has fewer than 80 daily bars", "dataAudit": audit}), 400
        benchmark_result = build_benchmark(df, benchmark)
        results = []
        for index, strategy in enumerate(strategies):
            try:
                results.append(run_strategy(df, strategy, index, benchmark_result["summary"]))
            except StrategyConfigError as exc:
                results.append({
                    "id": strategy.get("id") or f"strategy-{index + 1}",
                    "status": "error",
                    "error": exc.as_dict(),
                })
        ranked = sorted(
            [item for item in results if item.get("status") != "error"],
            key=lambda item: item["summary"]["cagrPct"] or -999,
            reverse=True,
        )
        for rank, item in enumerate(ranked, start=1):
            item["summary"]["rank"] = rank
        return jsonify(
            {
                "generatedAt": datetime.now(LA_TZ).isoformat(timespec="seconds"),
                "alignedRange": {
                    "startDate": df["date"].iloc[0].date().isoformat(),
                    "endDate": df["date"].iloc[-1].date().isoformat(),
                    "rows": int(len(df)),
                },
                "dataAudit": audit,
                "benchmark": benchmark_result,
                "strategies": results,
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(port=5001, debug=True)
