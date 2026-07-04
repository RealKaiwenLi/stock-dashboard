from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from datetime import datetime
from urllib.error import URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import pandas as pd
from flask import Flask, jsonify, request

from notion_daily_recommendations import DailyRecommendationError, fetch_daily_recommendations, parse_date_range


LA_TZ = ZoneInfo("America/Los_Angeles")
MAX_STRATEGIES = 5


app = Flask(__name__)


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


def run_strategy(df: pd.DataFrame, strategy: dict, index: int, benchmark_summary: dict) -> dict:
    name = strategy_name(strategy, index)
    signal_asset = normalize_symbol(strategy.get("signalAsset"), "QQQ")
    risk_asset = normalize_symbol(strategy.get("riskAsset"), "QLD")
    fallback_asset = normalize_symbol(strategy.get("fallbackAsset"), signal_asset)
    signal_close = df[f"{signal_asset}_close"]
    entry_signal = build_entry_signal(df, signal_close, strategy)
    exit_signal, diagnostics = build_exit_signal(signal_close, strategy)

    held = fallback_asset
    pending: str | None = None
    values = [1.0]
    trades = []
    switches = 0

    for idx in range(1, len(df)):
        if pending is None:
            gross = asset_gross(df, idx, held)
        else:
            old = held
            gross = switch_gross(df, idx, old, pending)
            held = pending
            pending = None
            switches += 1
            reason_prefix = "Entry signal" if held == risk_asset else "Exit signal"
            trades.append(
                {
                    "signalDate": df.at[idx - 1, "date"].date().isoformat(),
                    "executionDate": df.at[idx, "date"].date().isoformat(),
                    "from": old,
                    "to": held,
                    "reason": reason_prefix,
                    "equityAfterTrade": round(values[-1] * gross, 4),
                }
            )

        values.append(values[-1] * gross)

        if held != risk_asset and bool(entry_signal.iloc[idx]):
            pending = risk_asset
        elif held == risk_asset and bool(exit_signal.iloc[idx]):
            pending = fallback_asset

    summary = summarize_returns(name, values, df["date"], switches)
    summary["winVsBenchmark"] = (summary["cagrPct"] or -999) > (benchmark_summary.get("cagrPct") or -999)
    summary["currentHolding"] = pending or held
    summary["latestSignal"] = "SWITCH" if pending else "HOLD"
    summary["rank"] = None
    latest_close = finite(signal_close.iloc[-1])
    latest_conditions = diagnostics["conditions"].copy()
    latest_conditions.append({"label": "Full exit signal", "value": diagnostics["logic"], "passed": bool(exit_signal.iloc[-1])})

    return {
        "id": strategy.get("id") or f"strategy-{index + 1}",
        "summary": summary,
        "equityCurve": [
            {"date": date.date().isoformat(), "value": round(value, 4)}
            for date, value in zip(pd.to_datetime(df["date"]), values)
        ],
        "trades": trades[-100:],
        "latestSignal": {
            "holding": pending or held,
            "action": "SWITCH" if pending else "HOLD",
            "conditions": latest_conditions,
            "explanation": explain_latest_signal(signal_asset, risk_asset, fallback_asset, pending or held, pending, diagnostics, latest_close),
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
        if len(df) < 80:
            return jsonify({"error": "Aligned data has fewer than 80 daily bars", "dataAudit": audit}), 400
        benchmark_result = build_benchmark(df, benchmark)
        results = [run_strategy(df, strategy, index, benchmark_result["summary"]) for index, strategy in enumerate(strategies)]
        ranked = sorted(results, key=lambda item: item["summary"]["cagrPct"] or -999, reverse=True)
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
