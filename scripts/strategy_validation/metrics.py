from __future__ import annotations

import pandas as pd

from .config import StrategyValidationConfig
from .engine import BacktestResult


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


def score_row(row: pd.Series, config: StrategyValidationConfig) -> dict[str, object]:
    scoring = config.scoring
    risk_flag = row["max_drawdown_ratio_vs_signal"] > scoring.max_drawdown_ratio_warn
    if row["max_drawdown_ratio_vs_signal"] <= scoring.max_drawdown_ratio_warn:
        drawdown_score = 100.0
    else:
        span = scoring.max_drawdown_ratio_zero - scoring.max_drawdown_ratio_warn
        drawdown_score = min(max((scoring.max_drawdown_ratio_zero - row["max_drawdown_ratio_vs_signal"]) / span, 0.0), 1.0) * 100.0

    component_scores = {
        "rolling_5y_win_rate": min(max(row["rolling_5y_win_rate"], 0.0), 1.0) * 100.0,
        "excess_cagr": min(max(row["excess_cagr_pct"] / scoring.excess_cagr_cap_pct, 0.0), 1.0) * 100.0,
        "excess_cagr_per_extra_dd": min(max(row["excess_cagr_per_extra_dd"] / scoring.excess_cagr_per_extra_dd_cap, 0.0), 1.0) * 100.0,
        "sharpe": min(max(row["sharpe"] / row["signal_sharpe"], 0.0), 1.0) * 100.0 if row["signal_sharpe"] else 0.0,
        "max_drawdown_ratio": drawdown_score,
        "dca_terminal": min(max(row["dca_terminal"] / row["signal_dca_terminal"], 0.0), 1.0) * 100.0,
        "recovery_days": min(max((scoring.recovery_ratio_warn - row["recovery_days_ratio_vs_signal"]) / (scoring.recovery_ratio_zero - scoring.recovery_ratio_warn), 0.0), 1.0) * 100.0,
    }
    contributions = {
        f"score_contribution_{name}": component_scores[name] * weight
        for name, weight in scoring.weights.items()
        if name in component_scores
    }
    total = sum(contributions.values())
    return {"score": total, "risk_flag": risk_flag, **contributions}


def summarize_result(result: BacktestResult, baseline: BacktestResult, start: str, end: str) -> dict[str, object]:
    curve = result.equity_curve
    baseline_curve = baseline.equity_curve
    years = len(curve) / 252.0
    rolling_1y = rolling_stats(curve, baseline_curve, 252)
    rolling_3y = rolling_stats(curve, baseline_curve, 756)
    rolling_5y = rolling_stats(curve, baseline_curve, 1260)
    dca_value = dca_terminal(curve)
    signal_dca_value = dca_terminal(baseline_curve)
    recovery_days = max_recovery_days(curve)
    signal_recovery_days = max_recovery_days(baseline_curve)
    worst_year = annual_returns(curve).min()
    signal_worst_year = annual_returns(baseline_curve).min()
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
        "max_drawdown_ratio_vs_signal": abs(result.max_drawdown) / abs(baseline.max_drawdown),
        "annual_vol_pct": result.annual_vol * 100.0,
        "sharpe": result.sharpe,
        "signal_sharpe": baseline.sharpe,
        "rolling_1y_win_rate": rolling_1y["win_rate"],
        "rolling_3y_win_rate": rolling_3y["win_rate"],
        "rolling_5y_win_rate": rolling_5y["win_rate"],
        "rolling_5y_median_cagr_pct": rolling_5y["median_cagr"] * 100.0,
        "rolling_5y_p25_cagr_pct": rolling_5y["p25_cagr"] * 100.0,
        "dca_terminal": dca_value,
        "signal_dca_terminal": signal_dca_value,
        "dca_vs_signal_pct": (dca_value / signal_dca_value - 1.0) * 100.0,
        "recovery_days": recovery_days,
        "recovery_days_ratio_vs_signal": recovery_days / signal_recovery_days if signal_recovery_days else 0.0,
        "worst_year_pct": worst_year * 100.0,
        "worst_year_diff_vs_signal_pct": (worst_year - signal_worst_year) * 100.0,
        "switches": result.switches,
        "switches_per_year": result.switches / years,
        "excess_cagr_per_extra_dd": excess_cagr_per_extra_dd,
        "note": result.note,
    }


def build_summary(results: list[BacktestResult], baseline: BacktestResult, start: str, end: str, config: StrategyValidationConfig) -> pd.DataFrame:
    rows = [summarize_result(result, baseline, start, end) for result in results]
    summary = pd.DataFrame(rows)
    scored = summary.apply(lambda row: pd.Series(score_row(row, config)), axis=1)
    summary = pd.concat([summary, scored], axis=1)
    summary["risk_flag"] = summary["risk_flag"].map({True: "HIGH_DD", False: ""})
    summary = summary.sort_values(["score", "cagr_pct"], ascending=False).reset_index(drop=True)
    summary.insert(0, "rank", range(1, len(summary) + 1))
    for col in summary.columns:
        if pd.api.types.is_float_dtype(summary[col]):
            summary[col] = summary[col].round(4)
    return summary

