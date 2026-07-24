from __future__ import annotations

import argparse
import itertools
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from strategy_validation.data import fetch_yahoo_history
from strategy_validation.engine import compute_macd


TRADING_DAYS = 252
RISK_ASSETS = {"QLD", "TQQQ"}


@dataclass(frozen=True)
class Candidate:
    name: str
    entry_ema: int | None = None
    cooldown: int = 0
    trend_days: int | None = None
    momentum_days: int | None = None
    vol_days: int = 20
    vol_cap: float | None = None
    vol_tier: float | None = None
    below_trend_cash: bool = False
    defer_entry_days: int = 0
    cooldown_vol_trigger: float | None = None
    entry_ema_else_qld: bool = False
    cooldown_else_qld: bool = False
    cooldown_after_loss_only: bool = False
    cooldown_after_underperform_only: bool = False
    cooldown_after_holding_at_most: int | None = None
    entry_ema_vol_trigger: float | None = None
    cooldown_short_or_vol_trigger: bool = False
    dynamic_vol_tier: bool = False
    vol_hysteresis: float = 0.0
    vol_rebalance_weekly: bool = False
    cooldown_momentum_ceiling: float | None = None


@dataclass
class Simulation:
    candidate: Candidate
    equity: pd.Series
    switches: int
    held_assets: pd.Series
    next_open_target: str | None


def fetch_panel(symbols: list[str], range_: str) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for symbol in symbols:
        history = fetch_yahoo_history(symbol, range_)
        frame = history[["date", "open", "close"]].rename(
            columns={"open": f"{symbol}_open", "close": f"{symbol}_close"}
        )
        frames.append(frame)
        print(
            f"fetched {symbol}: rows={len(frame)}, "
            f"{frame['date'].iloc[0].date()}..{frame['date'].iloc[-1].date()}",
            flush=True,
        )

    panel = frames[0]
    for frame in frames[1:]:
        panel = panel.merge(frame, on="date", how="inner")
    panel = panel.sort_values("date").dropna().reset_index(drop=True)
    if len(panel) < 1260:
        raise RuntimeError(f"Insufficient common history: {len(panel)} rows")
    return panel


def add_indicators(panel: pd.DataFrame) -> pd.DataFrame:
    out = panel.copy()
    close = out["QQQ_close"]
    macd = compute_macd(close, 24, 60, 5)
    out["macd"] = macd["macd"]
    out["macd_signal"] = macd["signal"]
    out["hist"] = macd["hist"]
    out["golden_cross"] = (out["macd"] > out["macd_signal"]) & (
        out["macd"].shift(1) <= out["macd_signal"].shift(1)
    )
    for days in (15, 20, 30, 50, 100, 150, 200, 210):
        out[f"ema_{days}"] = close.ewm(span=days, adjust=False).mean()
        out[f"sma_{days}"] = close.rolling(days).mean()
    for days in (63, 126, 252):
        out[f"momentum_{days}"] = close / close.shift(days) - 1.0
    daily_return = close.pct_change()
    for days in (10, 20, 40, 60):
        out[f"vol_{days}"] = daily_return.rolling(days).std(ddof=0) * math.sqrt(TRADING_DAYS)
    return out


def asset_close_to_close(panel: pd.DataFrame, idx: int, asset: str, cash_return: float) -> float:
    if asset == "CASH":
        return 1.0 + cash_return / TRADING_DAYS
    return float(panel.at[idx, f"{asset}_close"] / panel.at[idx - 1, f"{asset}_close"])


def switch_return(
    panel: pd.DataFrame,
    idx: int,
    held_asset: str,
    target_asset: str,
    cash_return: float,
    switch_cost_bps: float,
) -> float:
    if held_asset == target_asset:
        return asset_close_to_close(panel, idx, held_asset, cash_return)

    overnight = (
        1.0 + cash_return / (2 * TRADING_DAYS)
        if held_asset == "CASH"
        else float(panel.at[idx, f"{held_asset}_open"] / panel.at[idx - 1, f"{held_asset}_close"])
    )
    intraday = (
        1.0 + cash_return / (2 * TRADING_DAYS)
        if target_asset == "CASH"
        else float(panel.at[idx, f"{target_asset}_close"] / panel.at[idx, f"{target_asset}_open"])
    )
    return overnight * intraday * (1.0 - switch_cost_bps / 10_000.0)


def candidate_target(
    panel: pd.DataFrame,
    idx: int,
    held_asset: str,
    candidate: Candidate,
    last_exit_idx: int | None,
    last_exit_was_short: bool,
    entry_ready: bool,
) -> str:
    close = float(panel.at[idx, "QQQ_close"])
    baseline_exit = close < float(panel.at[idx, "ema_15"]) and float(panel.at[idx, "hist"]) > 0

    above_trend = True
    if candidate.trend_days is not None:
        trend = panel.at[idx, f"sma_{candidate.trend_days}"]
        above_trend = pd.notna(trend) and close > float(trend)

    positive_momentum = True
    if candidate.momentum_days is not None:
        momentum = panel.at[idx, f"momentum_{candidate.momentum_days}"]
        positive_momentum = pd.notna(momentum) and float(momentum) > 0

    if held_asset in RISK_ASSETS:
        if baseline_exit or not above_trend or not positive_momentum:
            return "CASH" if candidate.below_trend_cash and not above_trend else "QQQ"
        if candidate.dynamic_vol_tier and candidate.vol_tier is not None:
            should_check = True
            if candidate.vol_rebalance_weekly:
                current_week = pd.Timestamp(panel.at[idx, "date"]).isocalendar().week
                previous_week = pd.Timestamp(panel.at[idx - 1, "date"]).isocalendar().week
                should_check = current_week != previous_week
            if should_check:
                realized_vol = panel.at[idx, f"vol_{candidate.vol_days}"]
                if pd.notna(realized_vol):
                    if (
                        held_asset == "TQQQ"
                        and float(realized_vol) > candidate.vol_tier + candidate.vol_hysteresis
                    ):
                        return "QLD"
                    if (
                        held_asset == "QLD"
                        and float(realized_vol) < candidate.vol_tier - candidate.vol_hysteresis
                    ):
                        return "TQQQ"
        return held_asset

    if held_asset == "CASH":
        return "QQQ" if above_trend else "CASH"

    if candidate.below_trend_cash and not above_trend:
        return "CASH"

    if not entry_ready:
        return held_asset
    cooldown_active = last_exit_idx is not None and idx - last_exit_idx <= candidate.cooldown
    if cooldown_active and candidate.cooldown_short_or_vol_trigger:
        cooldown_vol = panel.at[idx, f"vol_{candidate.vol_days}"]
        cooldown_active = last_exit_was_short or (
            pd.notna(cooldown_vol)
            and candidate.cooldown_vol_trigger is not None
            and float(cooldown_vol) > candidate.cooldown_vol_trigger
        )
    elif cooldown_active and candidate.cooldown_vol_trigger is not None:
        cooldown_vol = panel.at[idx, f"vol_{candidate.vol_days}"]
        cooldown_active = pd.notna(cooldown_vol) and float(cooldown_vol) > candidate.cooldown_vol_trigger
    if cooldown_active and candidate.cooldown_momentum_ceiling is not None:
        momentum = panel.at[idx, "momentum_252"]
        if pd.notna(momentum) and float(momentum) > candidate.cooldown_momentum_ceiling:
            cooldown_active = False
    if cooldown_active:
        return "QLD" if candidate.cooldown_else_qld else held_asset
    entry_ema_active = candidate.entry_ema is not None
    if entry_ema_active and candidate.entry_ema_vol_trigger is not None:
        entry_vol = panel.at[idx, f"vol_{candidate.vol_days}"]
        entry_ema_active = pd.notna(entry_vol) and float(entry_vol) > candidate.entry_ema_vol_trigger
    if entry_ema_active and close <= float(panel.at[idx, f"ema_{candidate.entry_ema}"]):
        return "QLD" if candidate.entry_ema_else_qld else held_asset
    if not above_trend or not positive_momentum:
        return held_asset

    realized_vol = panel.at[idx, f"vol_{candidate.vol_days}"]
    if candidate.vol_cap is not None and (
        pd.isna(realized_vol) or float(realized_vol) > candidate.vol_cap
    ):
        return held_asset
    if candidate.vol_tier is not None and pd.notna(realized_vol):
        return "TQQQ" if float(realized_vol) <= candidate.vol_tier else "QLD"
    return "TQQQ"


def simulate(
    panel: pd.DataFrame,
    candidate: Candidate,
    switch_cost_bps: float = 0.0,
    cash_return: float = 0.0,
) -> Simulation:
    held_asset = "QQQ"
    pending_asset: str | None = None
    last_exit_idx: int | None = None
    last_exit_was_short = False
    armed_until: int | None = None
    risk_entry_idx: int | None = None
    risk_entry_price: float | None = None
    qqq_entry_price: float | None = None
    switches = 0
    values = [1.0]
    held_assets = ["QQQ"]

    for idx in range(1, len(panel)):
        if pending_asset is None:
            gross = asset_close_to_close(panel, idx, held_asset, cash_return)
        else:
            old_asset = held_asset
            gross = switch_return(
                panel,
                idx,
                held_asset,
                pending_asset,
                cash_return,
                switch_cost_bps,
            )
            held_asset = pending_asset
            pending_asset = None
            switches += 1
            if old_asset not in RISK_ASSETS and held_asset in RISK_ASSETS:
                risk_entry_idx = idx
                risk_entry_price = float(panel.at[idx, f"{held_asset}_open"])
                qqq_entry_price = float(panel.at[idx, "QQQ_open"])
            elif old_asset in RISK_ASSETS and held_asset not in RISK_ASSETS:
                activate_cooldown = True
                holding_days = idx - risk_entry_idx if risk_entry_idx is not None else 0
                risk_return = (
                    float(panel.at[idx, f"{old_asset}_open"]) / risk_entry_price - 1.0
                    if risk_entry_price
                    else 0.0
                )
                qqq_return = (
                    float(panel.at[idx, "QQQ_open"]) / qqq_entry_price - 1.0
                    if qqq_entry_price
                    else 0.0
                )
                if candidate.cooldown_after_loss_only and risk_return >= 0:
                    activate_cooldown = False
                if candidate.cooldown_after_underperform_only and risk_return >= qqq_return:
                    activate_cooldown = False
                if (
                    candidate.cooldown_after_holding_at_most is not None
                    and holding_days > candidate.cooldown_after_holding_at_most
                    and not candidate.cooldown_short_or_vol_trigger
                ):
                    activate_cooldown = False
                # Cooldown starts on the actual T+1 open execution day, not on
                # the prior close when the exit signal was observed.
                last_exit_idx = idx if activate_cooldown else None
                last_exit_was_short = (
                    candidate.cooldown_after_holding_at_most is not None
                    and holding_days <= candidate.cooldown_after_holding_at_most
                )
                risk_entry_idx = None
                risk_entry_price = None
                qqq_entry_price = None
        values.append(values[-1] * gross)
        held_assets.append(held_asset)

        if bool(panel.at[idx, "golden_cross"]) and candidate.defer_entry_days > 0:
            armed_until = idx + candidate.defer_entry_days
        entry_ready = bool(panel.at[idx, "golden_cross"])
        if (
            candidate.defer_entry_days > 0
            and armed_until is not None
            and idx <= armed_until
            and float(panel.at[idx, "macd"]) > float(panel.at[idx, "macd_signal"])
        ):
            entry_ready = True

        target = candidate_target(
            panel,
            idx,
            held_asset,
            candidate,
            last_exit_idx,
            last_exit_was_short,
            entry_ready,
        )
        if target != held_asset:
            pending_asset = target
            if target in RISK_ASSETS:
                armed_until = None
        elif armed_until is not None and idx >= armed_until:
            armed_until = None

    equity = pd.Series(values, index=pd.to_datetime(panel["date"]), name=candidate.name)
    holdings = pd.Series(held_assets, index=equity.index, name=f"{candidate.name} holding")
    return Simulation(
        candidate=candidate,
        equity=equity,
        switches=switches,
        held_assets=holdings,
        next_open_target=pending_asset,
    )


def max_drawdown(equity: pd.Series) -> float:
    return float((equity / equity.cummax() - 1.0).min())


def curve_metrics(equity: pd.Series) -> dict[str, float]:
    returns = equity.pct_change().dropna()
    years = len(returns) / TRADING_DAYS
    annual_vol = float(returns.std(ddof=0) * math.sqrt(TRADING_DAYS))
    sharpe = float(returns.mean() * TRADING_DAYS / annual_vol) if annual_vol else 0.0
    cagr = float((equity.iloc[-1] / equity.iloc[0]) ** (1.0 / years) - 1.0)
    return {
        "cagr": cagr,
        "max_drawdown": max_drawdown(equity),
        "annual_vol": annual_vol,
        "sharpe": sharpe,
    }


def rolling_win_rate(candidate: pd.Series, baseline: pd.Series, days: int) -> float:
    candidate_return = candidate / candidate.shift(days) - 1.0
    baseline_return = baseline / baseline.shift(days) - 1.0
    valid = candidate_return.notna() & baseline_return.notna()
    return float((candidate_return[valid] > baseline_return[valid]).mean()) if valid.any() else float("nan")


def sliced_curve(equity: pd.Series, start: str, end: str | None) -> pd.Series:
    sliced = equity.loc[start:end]
    return sliced / float(sliced.iloc[0])


def summarize(
    simulations: list[Simulation],
    baseline: Simulation,
    qqq_equity: pd.Series,
    start: str | None = None,
    end: str | None = None,
) -> pd.DataFrame:
    baseline_curve = baseline.equity if start is None else sliced_curve(baseline.equity, start, end)
    qqq_curve = qqq_equity if start is None else sliced_curve(qqq_equity, start, end)
    rows: list[dict[str, object]] = []
    for simulation in simulations:
        curve = simulation.equity if start is None else sliced_curve(simulation.equity, start, end)
        metrics = curve_metrics(curve)
        rows.append(
            {
                "strategy": simulation.candidate.name,
                "cagr_pct": metrics["cagr"] * 100,
                "max_drawdown_pct": metrics["max_drawdown"] * 100,
                "annual_vol_pct": metrics["annual_vol"] * 100,
                "sharpe": metrics["sharpe"],
                "win_vs_qqq_1y": rolling_win_rate(curve, qqq_curve, 252) * 100,
                "win_vs_qqq_3y": rolling_win_rate(curve, qqq_curve, 756) * 100,
                "win_vs_qqq_5y": rolling_win_rate(curve, qqq_curve, 1260) * 100,
                "win_vs_current_1y": rolling_win_rate(curve, baseline_curve, 252) * 100,
                "win_vs_current_3y": rolling_win_rate(curve, baseline_curve, 756) * 100,
                "win_vs_current_5y": rolling_win_rate(curve, baseline_curve, 1260) * 100,
                "switches": simulation.switches if start is None else float("nan"),
            }
        )
    return pd.DataFrame(rows).sort_values(["sharpe", "cagr_pct"], ascending=False).reset_index(drop=True)


def build_candidates() -> list[Candidate]:
    candidates = [
        Candidate("CURRENT: MACD(24,60,5) / EMA15"),
    ]

    for cooldown, entry_ema in itertools.product((5, 10, 15, 20), (None, 20, 30, 50)):
        candidates.append(
            Candidate(
                f"quality: cooldown={cooldown}, entry_ema={entry_ema or 'none'}",
                cooldown=cooldown,
                entry_ema=entry_ema,
            )
        )

    for defer_days, cooldown, entry_ema in itertools.product(
        (5, 10, 20),
        (5, 10),
        (20, 30, 50),
    ):
        candidates.append(
            Candidate(
                f"deferred: wait={defer_days}, cooldown={cooldown}, entry_ema={entry_ema}",
                cooldown=cooldown,
                entry_ema=entry_ema,
                defer_entry_days=defer_days,
            )
        )

    for cooldown, defer_days in itertools.product(
        (5, 7, 9, 10, 11, 12, 15),
        (5, 10, 15, 20, 30),
    ):
        candidates.append(
            Candidate(
                f"cooldown-rearm: cooldown={cooldown}, rearm_for={defer_days}",
                cooldown=cooldown,
                defer_entry_days=defer_days,
            )
        )
        candidates.append(
            Candidate(
                f"short-rearm: cooldown={cooldown}, hold<=30, rearm_for={defer_days}",
                cooldown=cooldown,
                cooldown_after_holding_at_most=30,
                defer_entry_days=defer_days,
            )
        )

    for cooldown, defer_days, momentum_ceiling in itertools.product(
        (15, 20),
        (15, 20, 30),
        (0.0, 0.10, 0.20, 0.30, 0.40),
    ):
        candidates.append(
            Candidate(
                f"momentum-rearm: cooldown={cooldown}, rearm={defer_days}, "
                f"only_if_mom252<={momentum_ceiling:.0%}",
                cooldown=cooldown,
                defer_entry_days=defer_days,
                cooldown_momentum_ceiling=momentum_ceiling,
            )
        )

    for cooldown, defer_days in itertools.product(
        (13, 14, 15, 16, 17, 18, 20),
        (3, 5, 7),
    ):
        candidates.append(
            Candidate(
                f"rearm-neighborhood: cooldown={cooldown}, rearm_for={defer_days}",
                cooldown=cooldown,
                defer_entry_days=defer_days,
            )
        )

    for cooldown, defer_days in itertools.product(
        (13, 14, 15, 16, 17, 18, 20),
        (15, 20, 30, 40),
    ):
        candidates.append(
            Candidate(
                f"long-rearm-neighborhood: cooldown={cooldown}, rearm_for={defer_days}",
                cooldown=cooldown,
                defer_entry_days=defer_days,
            )
        )

    for cooldown, vol_trigger in itertools.product((5, 10, 15), (0.20, 0.25, 0.30, 0.35)):
        candidates.append(
            Candidate(
                f"adaptive-cooldown: days={cooldown}, only_vol_above={vol_trigger:.0%}",
                cooldown=cooldown,
                vol_days=20,
                cooldown_vol_trigger=vol_trigger,
            )
        )

    for cooldown, max_holding in itertools.product(
        (7, 8, 9, 10, 11, 12, 13),
        (25, 30, 35, 40),
    ):
        candidates.append(
            Candidate(
                f"short-neighborhood: cooldown={cooldown}, hold<={max_holding}",
                cooldown=cooldown,
                cooldown_after_holding_at_most=max_holding,
            )
        )

    for cooldown, max_holding, vol_trigger in itertools.product(
        (8, 10, 12, 15),
        (20, 30, 40),
        (0.22, 0.24, 0.25, 0.26, 0.28),
    ):
        candidates.append(
            Candidate(
                f"stress-neighborhood: cooldown={cooldown}, hold<={max_holding}, "
                f"ema30_if_vol>{vol_trigger:.0%}",
                cooldown=cooldown,
                entry_ema=30,
                vol_days=20,
                entry_ema_vol_trigger=vol_trigger,
                cooldown_vol_trigger=vol_trigger,
                cooldown_after_holding_at_most=max_holding,
            )
        )

    for cooldown, max_holding, vol_trigger in itertools.product(
        (7, 10, 12, 15),
        (20, 30, 40),
        (0.20, 0.22, 0.24, 0.25, 0.26, 0.28),
    ):
        candidates.append(
            Candidate(
                f"regime-combined: cooldown={cooldown}, short<={max_holding} "
                f"or_vol>{vol_trigger:.0%}, ema30_in_stress",
                cooldown=cooldown,
                entry_ema=30,
                vol_days=20,
                entry_ema_vol_trigger=vol_trigger,
                cooldown_vol_trigger=vol_trigger,
                cooldown_after_holding_at_most=max_holding,
                cooldown_short_or_vol_trigger=True,
            )
        )

    for cooldown in (5, 10, 15, 20, 30):
        candidates.extend(
            [
                Candidate(
                    f"conditional-cooldown: days={cooldown}, after_loss",
                    cooldown=cooldown,
                    cooldown_after_loss_only=True,
                ),
                Candidate(
                    f"conditional-cooldown: days={cooldown}, after_underperform",
                    cooldown=cooldown,
                    cooldown_after_underperform_only=True,
                ),
            ]
        )
        for max_holding in (5, 10, 20, 30):
            candidates.append(
                Candidate(
                    f"conditional-cooldown: days={cooldown}, after_hold<={max_holding}",
                    cooldown=cooldown,
                    cooldown_after_holding_at_most=max_holding,
                )
            )

    for cooldown, vol_trigger in itertools.product((5, 10, 15), (0.20, 0.25, 0.30, 0.35)):
        candidates.append(
            Candidate(
                f"stress-quality: cooldown={cooldown}, ema30_if_vol>{vol_trigger:.0%}",
                cooldown=cooldown,
                entry_ema=30,
                vol_days=20,
                entry_ema_vol_trigger=vol_trigger,
                cooldown_vol_trigger=vol_trigger,
            )
        )
        candidates.append(
            Candidate(
                f"stress-short: cooldown={cooldown}, hold<=30, ema30_if_vol>{vol_trigger:.0%}",
                cooldown=cooldown,
                entry_ema=30,
                vol_days=20,
                entry_ema_vol_trigger=vol_trigger,
                cooldown_vol_trigger=vol_trigger,
                cooldown_after_holding_at_most=30,
            )
        )

    for cooldown, entry_ema in itertools.product((5, 10, 15), (20, 30, 50)):
        candidates.append(
            Candidate(
                f"delever-blocked: cooldown={cooldown}, entry_ema={entry_ema}, use_QLD",
                cooldown=cooldown,
                entry_ema=entry_ema,
                entry_ema_else_qld=True,
                cooldown_else_qld=True,
            )
        )

    for trend_days, momentum_days, below_trend_cash in itertools.product(
        (150, 200, 210),
        (None, 126, 252),
        (False, True),
    ):
        candidates.append(
            Candidate(
                f"trend: sma={trend_days}, mom={momentum_days or 'none'}, "
                f"below={'cash' if below_trend_cash else 'qqq'}",
                trend_days=trend_days,
                momentum_days=momentum_days,
                below_trend_cash=below_trend_cash,
            )
        )

    for vol_days, threshold in itertools.product((10, 20, 40, 60), (0.20, 0.25, 0.30, 0.35)):
        candidates.append(
            Candidate(
                f"vol-cap: days={vol_days}, cap={threshold:.0%}",
                vol_days=vol_days,
                vol_cap=threshold,
            )
        )
        candidates.append(
            Candidate(
                f"vol-tier: days={vol_days}, TQQQ_below={threshold:.0%}, else_QLD",
                vol_days=vol_days,
                vol_tier=threshold,
            )
        )

    for vol_days, threshold, hysteresis, weekly in itertools.product(
        (10, 20, 40),
        (0.20, 0.25, 0.30, 0.35),
        (0.0, 0.025, 0.05),
        (False, True),
    ):
        candidates.append(
            Candidate(
                f"dynamic-tier: days={vol_days}, threshold={threshold:.0%}, "
                f"hyst={hysteresis:.1%}, {'weekly' if weekly else 'daily'}",
                vol_days=vol_days,
                vol_tier=threshold,
                dynamic_vol_tier=True,
                vol_hysteresis=hysteresis,
                vol_rebalance_weekly=weekly,
            )
        )

    for cooldown, trend_days, vol_tier in itertools.product((5, 10), (150, 200, 210), (0.25, 0.30)):
        candidates.append(
            Candidate(
                f"combined: cooldown={cooldown}, sma={trend_days}, tier={vol_tier:.0%}",
                cooldown=cooldown,
                trend_days=trend_days,
                vol_days=20,
                vol_tier=vol_tier,
            )
        )
    return candidates


def print_section(title: str, frame: pd.DataFrame, limit: int) -> None:
    columns = [
        "strategy",
        "cagr_pct",
        "max_drawdown_pct",
        "sharpe",
        "win_vs_qqq_1y",
        "win_vs_qqq_3y",
        "win_vs_qqq_5y",
        "win_vs_current_1y",
        "win_vs_current_3y",
        "win_vs_current_5y",
        "switches",
    ]
    print(f"\n## {title}")
    print(frame[columns].head(limit).to_string(index=False, float_format=lambda value: f"{value:.3f}"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Research-only post-exit re-entry candidate strategy sweep.")
    parser.add_argument("--range", default="25y")
    parser.add_argument("--switch-cost-bps", type=float, default=0.0)
    parser.add_argument("--output", default="outputs/research/candidate-results.csv")
    parser.add_argument("--top", type=int, default=20)
    args = parser.parse_args()

    panel = add_indicators(fetch_panel(["QQQ", "QLD", "TQQQ"], args.range))
    candidates = build_candidates()
    simulations = [
        simulate(panel, candidate, switch_cost_bps=args.switch_cost_bps)
        for candidate in candidates
    ]
    baseline = simulations[0]

    qqq_equity = pd.Series(
        panel["QQQ_close"].to_numpy() / float(panel["QQQ_close"].iloc[0]),
        index=pd.to_datetime(panel["date"]),
        name="QQQ Buy & Hold",
    )
    full = summarize(simulations, baseline, qqq_equity)
    early = summarize(simulations, baseline, qqq_equity, "2010-01-01", "2018-12-31")
    validation = summarize(simulations, baseline, qqq_equity, "2019-01-01", "2022-12-31")
    holdout = summarize(simulations, baseline, qqq_equity, "2023-01-01", None)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    all_samples = pd.concat(
        [
            full.assign(sample="full"),
            early.assign(sample="early_2010_2018"),
            validation.assign(sample="validation_2019_2022"),
            holdout.assign(sample="holdout_2023_latest"),
        ],
        ignore_index=True,
    )
    all_samples.to_csv(output, index=False)
    print(
        f"\ncommon range: {panel['date'].iloc[0].date()}..{panel['date'].iloc[-1].date()}, "
        f"rows={len(panel)}, candidates={len(candidates)}, switch_cost_bps={args.switch_cost_bps:g}"
    )
    print_section("Full history", full, args.top)
    print_section("Early sample 2010-2018", early, 10)
    print_section("Validation 2019-2022", validation, 10)
    print_section("Recent holdout 2023-latest", holdout, 10)
    print(f"\nwrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
