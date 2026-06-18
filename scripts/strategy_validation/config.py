from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SymbolConfig:
    signal: str
    risk: str
    cash: str = "CASH"


@dataclass(frozen=True)
class OutputConfig:
    markdown: bool = True
    json: bool = True
    csv: bool = False


@dataclass(frozen=True)
class ScoringConfig:
    weights: dict[str, float]
    max_drawdown_ratio_warn: float
    max_drawdown_ratio_zero: float
    excess_cagr_cap_pct: float
    excess_cagr_per_extra_dd_cap: float
    recovery_ratio_warn: float
    recovery_ratio_zero: float
    max_switches_per_year: float


@dataclass(frozen=True)
class StrategyValidationConfig:
    report_type: str
    report_title: str
    symbols: SymbolConfig
    yahoo_range: str
    execution: str
    cash_return: float
    macd_params: list[tuple[int, int, int]]
    exit_emas: list[int]
    sma200_cash_options: list[bool]
    baselines: list[str]
    scoring: ScoringConfig
    outputs: OutputConfig
    raw: dict[str, Any]


DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "configs" / "nasdaq_qld.json"


def _require(raw: dict[str, Any], key: str) -> Any:
    if key not in raw:
        raise ValueError(f"Config missing required key: {key}")
    return raw[key]


def load_config(path: Path | None = None) -> StrategyValidationConfig:
    config_path = path or DEFAULT_CONFIG_PATH
    raw = json.loads(config_path.read_text(encoding="utf-8"))

    symbols = _require(raw, "symbols")
    scoring = _require(raw, "scoring")
    outputs = raw.get("outputs", {})

    weights = dict(_require(scoring, "weights"))
    if not weights:
        raise ValueError("Config scoring.weights cannot be empty")

    return StrategyValidationConfig(
        report_type=str(_require(raw, "report_type")),
        report_title=str(_require(raw, "report_title")),
        symbols=SymbolConfig(
            signal=str(_require(symbols, "signal")),
            risk=str(_require(symbols, "risk")),
            cash=str(symbols.get("cash", "CASH")),
        ),
        yahoo_range=str(raw.get("yahoo_range", "25y")),
        execution=str(raw.get("execution", "T 日收盘确认 / T+1 开盘成交")),
        cash_return=float(raw.get("cash_return", 0.0)),
        macd_params=[tuple(int(x) for x in item) for item in _require(raw, "macd_params")],
        exit_emas=[int(x) for x in _require(raw, "exit_emas")],
        sma200_cash_options=[bool(x) for x in _require(raw, "sma200_cash_options")],
        baselines=[str(x) for x in _require(raw, "baselines")],
        scoring=ScoringConfig(
            weights=weights,
            max_drawdown_ratio_warn=float(scoring.get("max_drawdown_ratio_warn", 1.3)),
            max_drawdown_ratio_zero=float(scoring.get("max_drawdown_ratio_zero", 1.6)),
            excess_cagr_cap_pct=float(scoring.get("excess_cagr_cap_pct", 10.0)),
            excess_cagr_per_extra_dd_cap=float(scoring.get("excess_cagr_per_extra_dd_cap", 0.004)),
            recovery_ratio_warn=float(scoring.get("recovery_ratio_warn", 1.5)),
            recovery_ratio_zero=float(scoring.get("recovery_ratio_zero", 2.0)),
            max_switches_per_year=float(scoring.get("max_switches_per_year", 30.0)),
        ),
        outputs=OutputConfig(
            markdown=bool(outputs.get("markdown", True)),
            json=bool(outputs.get("json", True)),
            csv=bool(outputs.get("csv", False)),
        ),
        raw=raw,
    )

