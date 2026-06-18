from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from .config import StrategyValidationConfig


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


def compute_macd(close: pd.Series, fast: int, slow: int, signal: int) -> pd.DataFrame:
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return pd.DataFrame({"macd": macd_line, "signal": signal_line, "hist": macd_line - signal_line})


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


def gross_for_asset(df: pd.DataFrame, idx: int, asset: str, config: StrategyValidationConfig) -> float:
    if asset == config.symbols.signal:
        return float(df.at[idx, "signal_cc"])
    if asset == config.symbols.risk:
        return float(df.at[idx, "risk_cc"])
    if asset == config.symbols.cash:
        return 1.0 + config.cash_return / 252.0
    raise ValueError(f"Unknown asset: {asset}")


def switch_gross(df: pd.DataFrame, idx: int, held_asset: str, pending_asset: str, config: StrategyValidationConfig) -> float:
    signal = config.symbols.signal
    risk = config.symbols.risk
    cash = config.symbols.cash
    if held_asset == cash and pending_asset == cash:
        return 1.0 + config.cash_return / 252.0
    if held_asset == cash:
        return float(df.at[idx, "signal_id"] if pending_asset == signal else df.at[idx, "risk_id"])
    if pending_asset == cash:
        return float(df.at[idx, "signal_ov"] if held_asset == signal else df.at[idx, "risk_ov"])
    overnight_key = "signal_ov" if held_asset == signal else "risk_ov"
    intraday_key = "signal_id" if pending_asset == signal else "risk_id"
    return float(df.at[idx, overnight_key] * df.at[idx, intraday_key])


def backtest_signal_buy_hold(df: pd.DataFrame, config: StrategyValidationConfig) -> BacktestResult:
    equity = df["signal_cc"].fillna(1.0).cumprod()
    symbol = config.symbols.signal
    return summarize(f"{symbol} Buy & Hold", df["date"], equity.tolist(), 0, f"基准：不择时、不加杠杆，用来衡量所有策略是否值得替代 {symbol}。")


def backtest_risk_buy_hold(df: pd.DataFrame, config: StrategyValidationConfig) -> BacktestResult:
    equity = df["risk_cc"].fillna(1.0).cumprod()
    symbol = config.symbols.risk
    return summarize(f"{symbol} Buy & Hold", df["date"], equity.tolist(), 0, f"纯杠杆或高风险暴露，收益潜力高，但最大回撤和波动通常明显放大。")


def backtest_50_50(df: pd.DataFrame, config: StrategyValidationConfig) -> BacktestResult:
    signal_equity = df["signal_cc"].fillna(1.0).cumprod()
    risk_equity = df["risk_cc"].fillna(1.0).cumprod()
    equity = 0.5 * signal_equity + 0.5 * risk_equity
    return summarize(f"50% {config.symbols.signal} + 50% {config.symbols.risk} Buy & Hold", df["date"], equity.tolist(), 0, "静态约 1.5 倍风险暴露，用来比较不用择时、只提高杠杆后的结果。")


def backtest_param_strategy(df: pd.DataFrame, spec: StrategySpec, config: StrategyValidationConfig) -> BacktestResult:
    signal_symbol = config.symbols.signal
    risk_symbol = config.symbols.risk
    cash_symbol = config.symbols.cash
    macd = compute_macd(df["signal_close"], spec.fast, spec.slow, spec.signal)
    ema = df["signal_close"].ewm(span=spec.exit_ema, adjust=False).mean()
    golden_cross = (macd["macd"] > macd["signal"]) & (macd["macd"].shift(1) <= macd["signal"].shift(1))
    ema_break = (df["signal_close"] < ema) & (macd["hist"] > 0)

    held_asset = signal_symbol
    pending_asset: str | None = None
    switches = 0
    close_values = [1.0]

    for idx in range(1, len(df)):
        if pending_asset is None:
            gross = gross_for_asset(df, idx, held_asset, config)
        else:
            gross = switch_gross(df, idx, held_asset, pending_asset, config)
            held_asset = pending_asset
            pending_asset = None
            switches += 1

        close_values.append(close_values[-1] * gross)

        below_sma200 = pd.notna(df.at[idx, "sma200"]) and df.at[idx, "signal_close"] < df.at[idx, "sma200"]
        above_sma200 = pd.notna(df.at[idx, "sma200"]) and df.at[idx, "signal_close"] > df.at[idx, "sma200"]
        if spec.sma200_cash and below_sma200:
            if held_asset != cash_symbol:
                pending_asset = cash_symbol
            continue
        if spec.sma200_cash and held_asset == cash_symbol:
            if above_sma200:
                pending_asset = signal_symbol
            continue

        if held_asset == signal_symbol and bool(golden_cross.iloc[idx]):
            pending_asset = risk_symbol
        elif held_asset == risk_symbol and bool(ema_break.iloc[idx]):
            pending_asset = signal_symbol

    note = (
        f"默认持有 {signal_symbol}；{signal_symbol} 出现 MACD({spec.fast},{spec.slow},{spec.signal}) 金叉后，下一交易日开盘切到 {risk_symbol}；"
        f"{signal_symbol} 跌破 EMA{spec.exit_ema} 且 MACD hist > 0 时，下一交易日开盘退回 {signal_symbol}；"
        f"{f'若 {signal_symbol} 跌破 SMA200，则转现金，重新站上 SMA200 后回到 {signal_symbol}' if spec.sma200_cash else f'策略永不转现金，只在 {signal_symbol} 和 {risk_symbol} 之间切换'}。"
    )
    return summarize(spec.name, df["date"], close_values, switches, note)


def backtest_200dma(df: pd.DataFrame, config: StrategyValidationConfig) -> BacktestResult:
    invested = True
    pending_state: bool | None = None
    switches = 0
    close_values = [1.0]
    for idx in range(1, len(df)):
        if pending_state is None:
            gross = df.at[idx, "signal_cc"] if invested else 1.0
        else:
            gross = df.at[idx, "signal_ov"] if invested and not pending_state else df.at[idx, "signal_id"] if not invested and pending_state else (df.at[idx, "signal_cc"] if invested else 1.0)
            invested = pending_state
            pending_state = None
            switches += 1
        close_values.append(close_values[-1] * gross)
        if pd.isna(df.at[idx, "sma200"]):
            continue
        if invested and df.at[idx, "signal_close"] < df.at[idx, "sma200"]:
            pending_state = False
        elif not invested and df.at[idx, "signal_close"] > df.at[idx, "sma200"]:
            pending_state = True
    symbol = config.symbols.signal
    return summarize(f"Photo 2: {symbol} > SMA200 Else Cash", df["date"], close_values, switches, "防守型趋势策略：跌破 200 日均线转现金，通常能降低熊市回撤，但可能牺牲牛市收益。")


def backtest_50_200_cross(df: pd.DataFrame, config: StrategyValidationConfig) -> BacktestResult:
    invested = True
    pending_state: bool | None = None
    switches = 0
    close_values = [1.0]
    cross_up = (df["sma50"] > df["sma200"]) & (df["sma50"].shift(1) <= df["sma200"].shift(1))
    cross_down = (df["sma50"] < df["sma200"]) & (df["sma50"].shift(1) >= df["sma200"].shift(1))
    for idx in range(1, len(df)):
        if pending_state is None:
            gross = df.at[idx, "signal_cc"] if invested else 1.0
        else:
            gross = df.at[idx, "signal_ov"] if invested and not pending_state else df.at[idx, "signal_id"] if not invested and pending_state else (df.at[idx, "signal_cc"] if invested else 1.0)
            invested = pending_state
            pending_state = None
            switches += 1
        close_values.append(close_values[-1] * gross)
        if invested and bool(cross_down.iloc[idx]):
            pending_state = False
        elif not invested and bool(cross_up.iloc[idx]):
            pending_state = True
    return summarize("Photo 3: SMA50/200 Cross Else Cash", df["date"], close_values, switches, "慢速趋势策略：50/200 均线金叉买入、死叉转现金，交易少但信号更滞后。")


def strategy_specs(config: StrategyValidationConfig) -> list[StrategySpec]:
    out = []
    for fast, slow, signal in config.macd_params:
        for ema in config.exit_emas:
            for sma200_cash in config.sma200_cash_options:
                cash_rule = "跌破SMA200转现金" if sma200_cash else "永不转现金"
                out.append(
                    StrategySpec(
                        name=f"MACD({fast},{slow},{signal})金叉买{config.symbols.risk} / EMA{ema}退回{config.symbols.signal} / {cash_rule}",
                        fast=fast,
                        slow=slow,
                        signal=signal,
                        exit_ema=ema,
                        sma200_cash=sma200_cash,
                    )
                )
    return out


def run_backtests(df: pd.DataFrame, config: StrategyValidationConfig) -> tuple[BacktestResult, list[BacktestResult]]:
    baseline = backtest_signal_buy_hold(df, config)
    results: list[BacktestResult] = []
    baseline_map = {
        "signal_buy_hold": baseline,
        "risk_buy_hold": backtest_risk_buy_hold(df, config),
        "fifty_fifty": backtest_50_50(df, config),
        "sma200_cash": backtest_200dma(df, config),
        "sma50_200_cash": backtest_50_200_cross(df, config),
    }
    for name in config.baselines:
        if name not in baseline_map:
            raise ValueError(f"Unknown baseline: {name}")
        results.append(baseline_map[name])
    results.extend(backtest_param_strategy(df, spec, config) for spec in strategy_specs(config))
    return baseline, results

