from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import pandas as pd


YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart"
NOTION_VERSION = "2022-06-28"
LA_TZ = ZoneInfo("America/Los_Angeles")
REPORT_TYPE = "纳斯达克策略回测"


@dataclass
class BacktestResult:
    name: str
    total_return: float
    cagr: float
    max_drawdown: float
    annual_vol: float
    sharpe: float
    switches: int
    equity_curve: pd.Series
    note: str


@dataclass(frozen=True)
class StrategySpec:
    name: str
    fast: int
    slow: int
    signal: int
    exit_ema: int
    sma200_cash: bool


def load_dotenv_file(dotenv_path: Path) -> None:
    if not dotenv_path.exists():
        return
    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key and key not in os.environ:
            os.environ[key] = value


def yahoo_chart_url(symbol: str, range_: str = "25y") -> str:
    query = urlencode(
        {
            "interval": "1d",
            "range": range_,
            "includePrePost": "false",
            "events": "div,splits",
        }
    )
    return f"{YAHOO_CHART_BASE_URL}/{symbol}?{query}"


def fetch_yahoo_history(symbol: str, range_: str = "25y", max_retries: int = 3) -> pd.DataFrame:
    request = Request(
        yahoo_chart_url(symbol, range_),
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
        },
    )

    last_error: Exception | None = None
    for _ in range(max_retries):
        try:
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            break
        except (URLError, TimeoutError) as exc:
            last_error = exc
    else:
        raise RuntimeError(f"Yahoo chart API request failed for {symbol}: {last_error}")

    result = payload["chart"]["result"][0]
    timestamps = result["timestamp"]
    quote = result["indicators"]["quote"][0]
    records = []
    for ts, open_, high_, low_, close_, volume_ in zip(
        timestamps,
        quote["open"],
        quote["high"],
        quote["low"],
        quote["close"],
        quote["volume"],
    ):
        if close_ is None:
            continue
        records.append(
            {
                "date": pd.to_datetime(datetime.utcfromtimestamp(ts)).normalize(),
                "open": float(open_) if open_ is not None else None,
                "high": float(high_) if high_ is not None else None,
                "low": float(low_) if low_ is not None else None,
                "close": float(close_),
                "volume": int(volume_) if volume_ is not None else None,
            }
        )

    df = pd.DataFrame.from_records(records)
    if df.empty:
        raise RuntimeError(f"Yahoo chart API returned no rows for {symbol}")
    return df.sort_values("date").reset_index(drop=True)


def prepare_frame(qqq: pd.DataFrame, qld: pd.DataFrame) -> pd.DataFrame:
    qqq = qqq[["date", "open", "close"]].rename(columns={"open": "qqq_open", "close": "qqq_close"})
    qld = qld[["date", "open", "close"]].rename(columns={"open": "qld_open", "close": "qld_close"})

    qqq["sma50"] = qqq["qqq_close"].rolling(50).mean()
    qqq["sma200"] = qqq["qqq_close"].rolling(200).mean()

    df = qqq.merge(qld, on="date", how="inner")
    df["qqq_cc"] = df["qqq_close"] / df["qqq_close"].shift(1)
    df["qld_cc"] = df["qld_close"] / df["qld_close"].shift(1)
    df["qqq_ov"] = df["qqq_open"] / df["qqq_close"].shift(1)
    df["qld_ov"] = df["qld_open"] / df["qld_close"].shift(1)
    df["qqq_id"] = df["qqq_close"] / df["qqq_open"]
    df["qld_id"] = df["qld_close"] / df["qld_open"]
    return df.dropna(subset=["qqq_cc", "qld_cc", "qqq_ov", "qld_ov", "qqq_id", "qld_id"]).reset_index(drop=True)


def compute_macd(close: pd.Series, fast: int, slow: int, signal: int) -> pd.DataFrame:
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    hist = macd_line - signal_line
    return pd.DataFrame({"macd": macd_line, "signal": signal_line, "hist": hist})


def max_drawdown(equity_curve: pd.Series) -> float:
    return float((equity_curve / equity_curve.cummax() - 1.0).min())


def annualized_return(equity_curve: pd.Series, trading_days: int) -> float:
    years = trading_days / 252.0
    return float(equity_curve.iloc[-1] ** (1.0 / years) - 1.0) if years > 0 else 0.0


def annualized_vol(returns: pd.Series) -> float:
    return float(returns.std(ddof=0) * (252.0**0.5))


def sharpe_ratio(returns: pd.Series) -> float:
    vol = annualized_vol(returns)
    return float((returns.mean() * 252.0) / vol) if vol else 0.0


def summarize(name: str, dates: pd.Series, close_values: list[float], switches: int, note: str) -> BacktestResult:
    equity_curve = pd.Series(close_values, index=pd.to_datetime(dates))
    returns = equity_curve.pct_change().fillna(0.0)
    return BacktestResult(
        name=name,
        total_return=float(equity_curve.iloc[-1] - 1.0),
        cagr=annualized_return(equity_curve, len(equity_curve)),
        max_drawdown=max_drawdown(equity_curve),
        annual_vol=annualized_vol(returns),
        sharpe=sharpe_ratio(returns),
        switches=switches,
        equity_curve=equity_curve,
        note=note,
    )


def backtest_qqq(df: pd.DataFrame) -> BacktestResult:
    equity = df["qqq_cc"].fillna(1.0).cumprod()
    return summarize("QQQ Buy & Hold", df["date"], equity.tolist(), 0, "基准：不择时、不加杠杆，用来衡量所有策略是否值得替代 QQQ。")


def backtest_qld(df: pd.DataFrame) -> BacktestResult:
    equity = df["qld_cc"].fillna(1.0).cumprod()
    return summarize("QLD Buy & Hold", df["date"], equity.tolist(), 0, "纯 2 倍杠杆暴露，收益潜力高，但最大回撤和波动通常明显放大。")


def backtest_50_50(df: pd.DataFrame) -> BacktestResult:
    qqq_equity = df["qqq_cc"].fillna(1.0).cumprod()
    qld_equity = df["qld_cc"].fillna(1.0).cumprod()
    equity = 0.5 * qqq_equity + 0.5 * qld_equity
    return summarize("50% QQQ + 50% QLD Buy & Hold", df["date"], equity.tolist(), 0, "静态约 1.5 倍 Nasdaq 暴露，用来比较不用择时、只提高杠杆后的结果。")


def gross_for_asset(df: pd.DataFrame, idx: int, asset: str) -> float:
    if asset == "QQQ":
        return float(df.at[idx, "qqq_cc"])
    if asset == "QLD":
        return float(df.at[idx, "qld_cc"])
    if asset == "CASH":
        return 1.0
    raise ValueError(f"Unknown asset: {asset}")


def switch_gross(df: pd.DataFrame, idx: int, held_asset: str, pending_asset: str) -> float:
    if held_asset == "CASH" and pending_asset == "CASH":
        return 1.0
    if held_asset == "CASH":
        return float(df.at[idx, "qqq_id"] if pending_asset == "QQQ" else df.at[idx, "qld_id"])
    if pending_asset == "CASH":
        return float(df.at[idx, "qqq_ov"] if held_asset == "QQQ" else df.at[idx, "qld_ov"])

    overnight_key = "qqq_ov" if held_asset == "QQQ" else "qld_ov"
    intraday_key = "qqq_id" if pending_asset == "QQQ" else "qld_id"
    return float(df.at[idx, overnight_key] * df.at[idx, intraday_key])


def backtest_param_strategy(df: pd.DataFrame, spec: StrategySpec) -> BacktestResult:
    macd = compute_macd(df["qqq_close"], spec.fast, spec.slow, spec.signal)
    ema = df["qqq_close"].ewm(span=spec.exit_ema, adjust=False).mean()
    golden_cross = (macd["macd"] > macd["signal"]) & (macd["macd"].shift(1) <= macd["signal"].shift(1))
    ema_break = (df["qqq_close"] < ema) & (macd["hist"] > 0)

    held_asset = "QQQ"
    pending_asset: str | None = None
    switches = 0
    close_values = [1.0]

    for idx in range(1, len(df)):
        if pending_asset is None:
            gross = gross_for_asset(df, idx, held_asset)
        else:
            gross = switch_gross(df, idx, held_asset, pending_asset)
            held_asset = pending_asset
            pending_asset = None
            switches += 1

        close_values.append(close_values[-1] * gross)

        below_sma200 = pd.notna(df.at[idx, "sma200"]) and df.at[idx, "qqq_close"] < df.at[idx, "sma200"]
        above_sma200 = pd.notna(df.at[idx, "sma200"]) and df.at[idx, "qqq_close"] > df.at[idx, "sma200"]
        if spec.sma200_cash and below_sma200:
            if held_asset != "CASH":
                pending_asset = "CASH"
            continue
        if spec.sma200_cash and held_asset == "CASH":
            if above_sma200:
                pending_asset = "QQQ"
            continue

        if held_asset == "QQQ" and bool(golden_cross.iloc[idx]):
            pending_asset = "QLD"
        elif held_asset == "QLD" and bool(ema_break.iloc[idx]):
            pending_asset = "QQQ"

    note = (
        f"参数组合：MACD({spec.fast},{spec.slow},{spec.signal}) + EMA{spec.exit_ema} 退出；"
        f"{'跌破 SMA200 转现金，偏防守' if spec.sma200_cash else '不使用 SMA200 风控，偏进攻'}。"
    )
    return summarize(spec.name, df["date"], close_values, switches, note)


def backtest_200dma(df: pd.DataFrame) -> BacktestResult:
    invested = True
    pending_state: bool | None = None
    switches = 0
    close_values = [1.0]

    for idx in range(1, len(df)):
        if pending_state is None:
            gross = df.at[idx, "qqq_cc"] if invested else 1.0
        else:
            gross = df.at[idx, "qqq_ov"] if invested and not pending_state else df.at[idx, "qqq_id"] if not invested and pending_state else (df.at[idx, "qqq_cc"] if invested else 1.0)
            invested = pending_state
            pending_state = None
            switches += 1

        close_values.append(close_values[-1] * gross)
        if pd.isna(df.at[idx, "sma200"]):
            continue
        if invested and df.at[idx, "qqq_close"] < df.at[idx, "sma200"]:
            pending_state = False
        elif not invested and df.at[idx, "qqq_close"] > df.at[idx, "sma200"]:
            pending_state = True

    return summarize("Photo 2: QQQ > SMA200 Else Cash", df["date"], close_values, switches, "防守型趋势策略：跌破 200 日均线转现金，通常能降低熊市回撤，但可能牺牲牛市收益。")


def backtest_50_200_cross(df: pd.DataFrame) -> BacktestResult:
    invested = True
    pending_state: bool | None = None
    switches = 0
    close_values = [1.0]
    cross_up = (df["sma50"] > df["sma200"]) & (df["sma50"].shift(1) <= df["sma200"].shift(1))
    cross_down = (df["sma50"] < df["sma200"]) & (df["sma50"].shift(1) >= df["sma200"].shift(1))

    for idx in range(1, len(df)):
        if pending_state is None:
            gross = df.at[idx, "qqq_cc"] if invested else 1.0
        else:
            gross = df.at[idx, "qqq_ov"] if invested and not pending_state else df.at[idx, "qqq_id"] if not invested and pending_state else (df.at[idx, "qqq_cc"] if invested else 1.0)
            invested = pending_state
            pending_state = None
            switches += 1

        close_values.append(close_values[-1] * gross)
        if invested and bool(cross_down.iloc[idx]):
            pending_state = False
        elif not invested and bool(cross_up.iloc[idx]):
            pending_state = True

    return summarize("Photo 3: SMA50/200 Cross Else Cash", df["date"], close_values, switches, "慢速趋势策略：50/200 均线金叉买入、死叉转现金，交易少但信号更滞后。")


def strategy_specs() -> list[StrategySpec]:
    macd_params = [(8, 17, 9), (12, 26, 9), (19, 39, 9)]
    emas = [10, 15, 20]
    out = []
    for fast, slow, signal in macd_params:
        for ema in emas:
            for sma200_cash in [False, True]:
                suffix = "SMA200Cash" if sma200_cash else "NoSMA"
                out.append(
                    StrategySpec(
                        name=f"MACD({fast},{slow},{signal}) / EMA{ema} Exit / {suffix}",
                        fast=fast,
                        slow=slow,
                        signal=signal,
                        exit_ema=ema,
                        sma200_cash=sma200_cash,
                    )
                )
    return out


def rolling_stats(strategy: pd.Series, baseline: pd.Series, days: int) -> dict[str, float]:
    strategy_return = strategy / strategy.shift(days) - 1.0
    baseline_return = baseline / baseline.shift(days) - 1.0
    valid = strategy_return.notna() & baseline_return.notna()
    if not valid.any():
        return {"win_rate": 0.0, "median_cagr": 0.0, "p25_cagr": 0.0}
    years = days / 252.0
    strategy_cagr = (1.0 + strategy_return[valid]).pow(1.0 / years) - 1.0
    return {
        "win_rate": float((strategy_return[valid] > baseline_return[valid]).mean()),
        "median_cagr": float(strategy_cagr.median()),
        "p25_cagr": float(strategy_cagr.quantile(0.25)),
    }


def dca_terminal(equity_curve: pd.Series) -> float:
    contribution_dates = pd.Series(equity_curve.index, index=equity_curve.index).groupby(
        [equity_curve.index.year, equity_curve.index.month]
    ).first()
    shares = 0.0
    for date in contribution_dates:
        shares += 1.0 / float(equity_curve.loc[date])
    return shares * float(equity_curve.iloc[-1])


def max_recovery_days(equity_curve: pd.Series) -> int:
    peak = equity_curve.cummax()
    underwater = equity_curve < peak
    max_days = 0
    current = 0
    for is_underwater in underwater:
        if is_underwater:
            current += 1
            max_days = max(max_days, current)
        else:
            current = 0
    return max_days


def annual_returns(equity_curve: pd.Series) -> pd.Series:
    return equity_curve.resample("Y").last().pct_change().dropna()


def score_row(row: pd.Series) -> tuple[float, bool]:
    risk_flag = row["max_drawdown_ratio_vs_qqq"] > 1.3
    if row["max_drawdown_ratio_vs_qqq"] <= 1.3:
        drawdown_score = 100.0
    else:
        # Above the hard line, fade to zero by 1.6x QQQ drawdown.
        drawdown_score = min(max((1.6 - row["max_drawdown_ratio_vs_qqq"]) / 0.3, 0.0), 1.0) * 100.0
    scores = {
        "rolling_5y_win_rate": min(max(row["rolling_5y_win_rate"], 0.0), 1.0) * 100.0,
        "excess_cagr": min(max(row["excess_cagr_pct"] / 10.0, 0.0), 1.0) * 100.0,
        "excess_cagr_per_extra_dd": min(max(row["excess_cagr_per_extra_dd"] / 0.004, 0.0), 1.0) * 100.0,
        "sharpe": min(max(row["sharpe"] / row["qqq_sharpe"], 0.0), 1.0) * 100.0 if row["qqq_sharpe"] else 0.0,
        "max_drawdown_ratio": drawdown_score,
        "dca_terminal": min(max(row["dca_terminal"] / row["qqq_dca_terminal"], 0.0), 1.0) * 100.0,
        "recovery_days": min(max((1.5 - row["recovery_days_ratio_vs_qqq"]) / 0.5, 0.0), 1.0) * 100.0,
        "switches": 100.0 if row["switches_per_year"] < 30.0 else 0.0,
    }
    total = (
        scores["rolling_5y_win_rate"] * 0.30
        + scores["excess_cagr"] * 0.25
        + scores["max_drawdown_ratio"] * 0.15
        + scores["dca_terminal"] * 0.10
        + scores["sharpe"] * 0.10
        + scores["excess_cagr_per_extra_dd"] * 0.05
        + scores["recovery_days"] * 0.05
    )
    return total, risk_flag


def summarize_result(result: BacktestResult, baseline: BacktestResult, start: str, end: str) -> dict[str, object]:
    curve = result.equity_curve
    baseline_curve = baseline.equity_curve
    years = len(curve) / 252.0
    rolling_1y = rolling_stats(curve, baseline_curve, 252)
    rolling_3y = rolling_stats(curve, baseline_curve, 756)
    rolling_5y = rolling_stats(curve, baseline_curve, 1260)
    dca_value = dca_terminal(curve)
    qqq_dca_value = dca_terminal(baseline_curve)
    recovery_days = max_recovery_days(curve)
    qqq_recovery_days = max_recovery_days(baseline_curve)
    worst_year = annual_returns(curve).min()
    qqq_worst_year = annual_returns(baseline_curve).min()
    extra_dd = abs(result.max_drawdown) - abs(baseline.max_drawdown)
    excess_cagr = result.cagr - baseline.cagr
    excess_cagr_per_extra_dd = excess_cagr / (extra_dd * 100.0) if extra_dd > 0 else excess_cagr

    return {
        "strategy": result.name,
        "start": start,
        "end": end,
        "total_return_pct": result.total_return * 100.0,
        "cagr_pct": result.cagr * 100.0,
        "excess_cagr_pct": excess_cagr * 100.0,
        "max_drawdown_pct": result.max_drawdown * 100.0,
        "max_drawdown_ratio_vs_qqq": abs(result.max_drawdown) / abs(baseline.max_drawdown),
        "annual_vol_pct": result.annual_vol * 100.0,
        "sharpe": result.sharpe,
        "qqq_sharpe": baseline.sharpe,
        "rolling_1y_win_rate": rolling_1y["win_rate"],
        "rolling_3y_win_rate": rolling_3y["win_rate"],
        "rolling_5y_win_rate": rolling_5y["win_rate"],
        "rolling_5y_median_cagr_pct": rolling_5y["median_cagr"] * 100.0,
        "rolling_5y_p25_cagr_pct": rolling_5y["p25_cagr"] * 100.0,
        "dca_terminal": dca_value,
        "qqq_dca_terminal": qqq_dca_value,
        "dca_vs_qqq_pct": (dca_value / qqq_dca_value - 1.0) * 100.0,
        "recovery_days": recovery_days,
        "recovery_days_ratio_vs_qqq": recovery_days / qqq_recovery_days if qqq_recovery_days else 0.0,
        "worst_year_pct": worst_year * 100.0,
        "worst_year_diff_vs_qqq_pct": (worst_year - qqq_worst_year) * 100.0,
        "switches": result.switches,
        "switches_per_year": result.switches / years,
        "excess_cagr_per_extra_dd": excess_cagr_per_extra_dd,
        "note": result.note,
    }


def build_summary(results: list[BacktestResult], baseline: BacktestResult, start: str, end: str) -> pd.DataFrame:
    rows = [summarize_result(result, baseline, start, end) for result in results]
    summary = pd.DataFrame(rows)
    scored = summary.apply(score_row, axis=1, result_type="expand")
    summary["score"] = scored[0]
    summary["risk_flag"] = scored[1].map({True: "HIGH_DD", False: ""})
    summary = summary.sort_values(["score", "cagr_pct"], ascending=False).reset_index(drop=True)
    summary.insert(0, "rank", range(1, len(summary) + 1))
    for col in summary.columns:
        if pd.api.types.is_float_dtype(summary[col]):
            summary[col] = summary[col].round(4)
    return summary


def format_float(value: object, digits: int = 2) -> str:
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def build_markdown(summary: pd.DataFrame, latest_bar_date: str, generated_at: str) -> str:
    display_cols = {
        "rank": "排名",
        "strategy": "策略",
        "score": "综合分",
        "risk_flag": "风险标记",
        "cagr_pct": "年化收益%",
        "excess_cagr_pct": "超额年化%",
        "max_drawdown_pct": "最大回撤%",
        "max_drawdown_ratio_vs_qqq": "回撤/QQQ",
        "sharpe": "夏普比率",
        "rolling_5y_win_rate": "滚动5年胜率",
        "dca_vs_qqq_pct": "定投领先QQQ%",
        "switches_per_year": "年均换仓",
    }
    lines = [
        f"# QQQ / QLD 策略周度验证 {latest_bar_date}",
        "",
        f"- 生成时间：`{generated_at}`",
        "- 数据源：`Yahoo Finance chart API`，每次运行拉取 `QQQ` 和 `QLD` 近 25 年日线。",
        "- 基准：`QQQ Buy & Hold`。",
        "- 执行口径：`T 日收盘确认 / T+1 开盘成交`。",
        "- 现金收益：`0%`；交易成本：`0`。",
        "- 评分权重：滚动 5 年胜率 0.30，超额年化收益 0.25，最大回撤 0.15，定投 0.10，夏普比率 0.10，超额年化收益/额外回撤 0.05，恢复时间 0.05。",
        "",
        "## 指标说明",
        "",
        "- `综合分`：按上面的权重把各项指标转成 0-100 分后加权，越高越好。",
        "- `风险标记`：`高回撤` 表示该策略最大回撤超过 QQQ 最大回撤的 1.3 倍。",
        "- `年化收益%`：策略全周期 CAGR。",
        "- `超额年化%`：策略年化收益减去 QQQ 年化收益。",
        "- `最大回撤%`：从历史高点到后续低点的最大跌幅。",
        "- `回撤/QQQ`：策略最大回撤除以 QQQ 最大回撤；小于等于 1.3 都视为可接受，超过 1.3 才标记高回撤。",
        "- `夏普比率`：当前用年化收益除以年化波动率，未扣无风险利率。",
        "- `滚动5年胜率`：任意一天开始持有 5 年，策略跑赢 QQQ 的比例。",
        "- `定投领先QQQ%`：每月定投该策略的终值相对每月定投 QQQ 的领先幅度。",
        "- `年均换仓`：平均每年切换持仓的次数。",
        "",
        "## 排名表",
        "",
        "| " + " | ".join(display_cols.values()) + " |",
        "| " + " | ".join(["---"] * len(display_cols)) + " |",
    ]
    for _, row in summary[list(display_cols.keys())].iterrows():
        values = []
        for col in display_cols:
            value = row[col]
            if col == "risk_flag" and value == "HIGH_DD":
                values.append("高回撤")
            elif col in {"rolling_5y_win_rate"} and isinstance(value, float):
                values.append(f"{value:.2%}")
            else:
                values.append(format_float(value, 2))
        lines.append("| " + " | ".join(values) + " |")

    lines.extend(["", "## 中文注释", ""])
    for _, row in summary.iterrows():
        note = str(row["note"]).rstrip("。.;； ")
        risk = "；高回撤标记" if row["risk_flag"] else ""
        lines.extend(
            [
                f"### {int(row['rank'])}. {row['strategy']}",
                "",
                f"{note}{risk}。年化收益 `{row['cagr_pct']:.2f}%`，最大回撤 `{row['max_drawdown_pct']:.2f}%`，滚动 5 年胜率 `{row['rolling_5y_win_rate']:.2%}`，综合分 `{row['score']:.2f}`。",
                "",
            ]
        )
    return "\n".join(lines)


def write_markdown(markdown: str, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown, encoding="utf-8")


def notion_request(method: str, url: str, token: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Notion-Version": NOTION_VERSION,
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Notion API {exc.code}: {body}") from exc


def query_existing_notion_page(database_id: str, notion_token: str, report_date: str) -> str | None:
    payload = {
        "filter": {
            "and": [
                {"property": "Date", "date": {"equals": report_date}},
                {"property": "报告类型", "select": {"equals": REPORT_TYPE}},
            ]
        },
        "page_size": 10,
    }
    response = notion_request("POST", f"https://api.notion.com/v1/databases/{database_id}/query", notion_token, payload)
    results = response.get("results", [])
    return results[0]["id"] if results else None


def build_notion_properties(report_date: str, top_strategy: str) -> dict:
    title = f"{report_date} 纳斯达克策略回测"
    return {
        "Doc name": {"title": [{"text": {"content": title}}]},
        "Date": {"date": {"start": report_date}},
        "报告类型": {"select": {"name": REPORT_TYPE}},
        "Key Tickers": {"rich_text": [{"text": {"content": "QQQ, QLD"}}]},
        "Status": {"select": {"name": "Ready"}},
    }


def text_rich(content: object) -> list[dict]:
    return [{"type": "text", "text": {"content": str(content)}}]


def paragraph_block(content: object) -> dict:
    return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {"rich_text": text_rich(content)},
    }


def bulleted_block(content: object) -> dict:
    return {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {"rich_text": text_rich(content)},
    }


def heading_block(level: int, content: object) -> dict:
    block_type = f"heading_{level}"
    return {
        "object": "block",
        "type": block_type,
        block_type: {"rich_text": text_rich(content)},
    }


def table_row_block(values: list[object]) -> dict:
    return {
        "object": "block",
        "type": "table_row",
        "table_row": {"cells": [text_rich(value) for value in values]},
    }


def build_notion_blocks(summary: pd.DataFrame, latest_bar_date: str, generated_at: str) -> list[dict]:
    display_cols = {
        "rank": "排名",
        "strategy": "策略",
        "score": "综合分",
        "risk_flag": "风险标记",
        "cagr_pct": "年化收益%",
        "excess_cagr_pct": "超额年化%",
        "max_drawdown_pct": "最大回撤%",
        "max_drawdown_ratio_vs_qqq": "回撤/QQQ",
        "sharpe": "夏普比率",
        "rolling_5y_win_rate": "滚动5年胜率",
        "dca_vs_qqq_pct": "定投领先QQQ%",
        "switches_per_year": "年均换仓",
    }
    blocks: list[dict] = [
        heading_block(1, f"QQQ / QLD 策略周度验证 {latest_bar_date}"),
        bulleted_block(f"生成时间：{generated_at}"),
        bulleted_block("数据源：Yahoo Finance chart API，每次运行拉取 QQQ 和 QLD 近 25 年日线。"),
        bulleted_block("基准：QQQ Buy & Hold。"),
        bulleted_block("执行口径：T 日收盘确认 / T+1 开盘成交。"),
        bulleted_block("现金收益：0%；交易成本：0。"),
        bulleted_block("评分权重：滚动 5 年胜率 0.30，超额年化收益 0.25，最大回撤 0.15，定投 0.10，夏普比率 0.10，超额年化收益/额外回撤 0.05，恢复时间 0.05。"),
        heading_block(2, "指标说明"),
        bulleted_block("综合分：按权重把各项指标转成 0-100 分后加权，越高越好。"),
        bulleted_block("风险标记：高回撤表示该策略最大回撤超过 QQQ 最大回撤的 1.3 倍。"),
        bulleted_block("回撤/QQQ：小于等于 1.3 都视为可接受，超过 1.3 才标记高回撤。"),
        bulleted_block("滚动5年胜率：任意一天开始持有 5 年，策略跑赢 QQQ 的比例。"),
        heading_block(2, "排名表"),
    ]

    table_children = [table_row_block(list(display_cols.values()))]
    for _, row in summary[list(display_cols.keys())].iterrows():
        values = []
        for col in display_cols:
            value = row[col]
            if col == "risk_flag" and value == "HIGH_DD":
                values.append("高回撤")
            elif col == "rolling_5y_win_rate" and isinstance(value, float):
                values.append(f"{value:.2%}")
            else:
                values.append(format_float(value, 2))
        table_children.append(table_row_block(values))
    blocks.append(
        {
            "object": "block",
            "type": "table",
            "table": {
                "table_width": len(display_cols),
                "has_column_header": True,
                "has_row_header": False,
                "children": table_children,
            },
        }
    )

    blocks.append(heading_block(2, "中文注释"))
    for _, row in summary.iterrows():
        note = str(row["note"]).rstrip("。.;； ")
        risk = "；高回撤标记" if row["risk_flag"] else ""
        blocks.append(heading_block(3, f"{int(row['rank'])}. {row['strategy']}"))
        blocks.append(
            paragraph_block(
                f"{note}{risk}。年化收益 {row['cagr_pct']:.2f}%，最大回撤 {row['max_drawdown_pct']:.2f}%，"
                f"滚动 5 年胜率 {row['rolling_5y_win_rate']:.2%}，综合分 {row['score']:.2f}。"
            )
        )
    return blocks


def archive_existing_children(page_id: str, notion_token: str) -> None:
    next_cursor = None
    while True:
        url = f"https://api.notion.com/v1/blocks/{page_id}/children?page_size=100"
        if next_cursor:
            url += f"&start_cursor={next_cursor}"
        response = notion_request("GET", url, notion_token)
        for block in response.get("results", []):
            notion_request("PATCH", f"https://api.notion.com/v1/blocks/{block['id']}", notion_token, {"archived": True})
        if not response.get("has_more"):
            break
        next_cursor = response.get("next_cursor")


def upsert_notion_entry(
    database_id: str,
    notion_token: str,
    report_date: str,
    summary: pd.DataFrame,
    latest_bar_date: str,
    generated_at: str,
    top_strategy: str,
) -> str:
    page_id = query_existing_notion_page(database_id, notion_token, report_date)
    properties = build_notion_properties(report_date, top_strategy)
    children = build_notion_blocks(summary, latest_bar_date, generated_at)

    if page_id is None:
        payload = {"parent": {"database_id": database_id}, "properties": properties}
        response = notion_request("POST", "https://api.notion.com/v1/pages", notion_token, payload)
        page_id = response["id"]
        notion_url = response["url"]
    else:
        notion_request("PATCH", f"https://api.notion.com/v1/pages/{page_id}", notion_token, {"properties": properties})
        archive_existing_children(page_id, notion_token)
        notion_url = f"https://www.notion.so/{page_id.replace('-', '')}"

    for start in range(0, len(children), 100):
        notion_request("PATCH", f"https://api.notion.com/v1/blocks/{page_id}/children", notion_token, {"children": children[start : start + 100]})
    return notion_url


def load_env_value(cli_value: str | None, env_name: str) -> str | None:
    return cli_value if cli_value else os.getenv(env_name)


def main() -> int:
    parser = argparse.ArgumentParser(description="Weekly QQQ/QLD strategy validation using Yahoo chart API and optional Notion upload.")
    parser.add_argument("--output-dir", default="outputs/strategy-validation", help="Directory for markdown and CSV outputs.")
    parser.add_argument("--notion-token", help="Optional Notion token. Falls back to NOTION_TOKEN env var.")
    parser.add_argument("--notion-database-id", help="Optional Notion database id. Falls back to NOTION_DATABASE_ID env var.")
    parser.add_argument("--skip-notion", action="store_true", help="Skip Notion upload even if env vars are set.")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    load_dotenv_file(project_root / ".env")

    qqq = fetch_yahoo_history("QQQ")
    qld = fetch_yahoo_history("QLD")
    df = prepare_frame(qqq, qld)
    if len(df) < 1260:
        raise RuntimeError(f"Data insufficient after QQQ/QLD merge: rows={len(df)}")

    baseline = backtest_qqq(df)
    results: list[BacktestResult] = [
        baseline,
        backtest_qld(df),
        backtest_50_50(df),
        backtest_200dma(df),
        backtest_50_200_cross(df),
    ]
    results.extend(backtest_param_strategy(df, spec) for spec in strategy_specs())

    start = df["date"].iloc[0].date().isoformat()
    latest_bar_date = df["date"].iloc[-1].date().isoformat()
    generated_at = datetime.now(LA_TZ).isoformat(timespec="seconds")
    report_date = datetime.now(LA_TZ).date().isoformat()
    summary = build_summary(results, baseline, start, latest_bar_date)
    markdown = build_markdown(summary, latest_bar_date, generated_at)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / f"strategy_validation_{latest_bar_date}.csv"
    md_path = output_dir / f"strategy_validation_{latest_bar_date}.md"
    summary.to_csv(csv_path, index=False)
    write_markdown(markdown, md_path)

    notion_url = "NONE"
    notion_token = load_env_value(args.notion_token, "NOTION_TOKEN")
    notion_database_id = load_env_value(args.notion_database_id, "NOTION_DATABASE_ID")
    if not args.skip_notion and notion_token and notion_database_id:
        notion_url = upsert_notion_entry(
            notion_database_id,
            notion_token,
            report_date,
            summary,
            latest_bar_date,
            generated_at,
            str(summary.iloc[0]["strategy"]),
        )

    print(f"latest_bar_date={latest_bar_date}")
    print(f"markdown_path={md_path}")
    print(f"csv_path={csv_path}")
    print(f"top_strategy={summary.iloc[0]['strategy']}")
    print(f"notion_url={notion_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
