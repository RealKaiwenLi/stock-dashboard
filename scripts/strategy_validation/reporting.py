from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from .config import StrategyValidationConfig


def format_float(value: object, digits: int = 2) -> str:
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def data_audit_items(data_audit: dict[str, dict[str, object]], markdown: bool = True) -> list[str]:
    items = []
    for label, item in data_audit.items():
        ending = "。" if label == "共同可用区间" else "；"
        start = f"`{item['start']}`" if markdown else str(item["start"])
        end = f"`{item['end']}`" if markdown else str(item["end"])
        items.append(f"{label} {start} 到 {end}，{item['rows']} 行{ending}")
    return items


def display_columns(config: StrategyValidationConfig) -> dict[str, str]:
    return {
        "rank": "排名",
        "strategy": "策略",
        "score": "综合分",
        "risk_flag": "风险标记",
        "cagr_pct": "年化收益%",
        "excess_cagr_pct": "超额年化%",
        "max_drawdown_pct": "最大回撤%",
        "max_drawdown_ratio_vs_signal": f"回撤/{config.symbols.signal}",
        "sharpe": "夏普比率",
        "rolling_1y_win_rate": "滚动1年胜率",
        "rolling_3y_win_rate": "滚动3年胜率",
        "rolling_5y_win_rate": "滚动5年胜率",
        "dca_vs_signal_pct": f"定投领先{config.symbols.signal}%",
        "switches_per_year": "年均换仓",
    }


def scoring_weights_text(config: StrategyValidationConfig) -> str:
    labels = {
        "rolling_5y_win_rate": "滚动 5 年胜率",
        "excess_cagr": "超额年化收益",
        "max_drawdown_ratio": "最大回撤",
        "dca_terminal": "定投",
        "sharpe": "夏普比率",
        "excess_cagr_per_extra_dd": "超额年化收益/额外回撤",
        "recovery_days": "恢复时间",
    }
    return "，".join(f"{labels.get(key, key)} {value:.2f}" for key, value in config.scoring.weights.items())


def build_markdown(summary: pd.DataFrame, latest_bar_date: str, generated_at: str, data_audit: dict[str, dict[str, object]], config: StrategyValidationConfig) -> str:
    cols = display_columns(config)
    lines = [
        f"# {config.report_title} {latest_bar_date}",
        "",
        f"- 生成时间：`{generated_at}`",
        "- 数据源：Yahoo Finance chart API；",
        *[f"  - {item}" for item in data_audit_items(data_audit)],
        f"- 基准：`{config.symbols.signal} Buy & Hold`。",
        f"- 执行口径：`{config.execution}`。",
        f"- 现金收益：`{config.cash_return:.2%}`；交易成本：`0`。",
        f"- 评分权重：{scoring_weights_text(config)}。",
        "",
        "## 指标说明",
        "",
        "- `综合分`：按上面的权重把各项指标转成 0-100 分后加权，越高越好。",
        f"- `风险标记`：`高回撤` 表示该策略最大回撤超过 {config.symbols.signal} 最大回撤的 {config.scoring.max_drawdown_ratio_warn:.1f} 倍。",
        "- `年化收益%`：策略全周期 CAGR。",
        f"- `超额年化%`：策略年化收益减去 {config.symbols.signal} 年化收益。",
        "- `最大回撤%`：从历史高点到后续低点的最大跌幅。",
        f"- `回撤/{config.symbols.signal}`：策略最大回撤除以 {config.symbols.signal} 最大回撤。",
        "- `夏普比率`：当前用年化收益除以年化波动率，未扣无风险利率。",
        f"- `滚动1/3/5年胜率`：任意一天开始分别持有 1、3、5 年，策略跑赢 {config.symbols.signal} 的比例。",
        f"- `定投领先{config.symbols.signal}%`：每月定投该策略的终值相对每月定投 {config.symbols.signal} 的领先幅度。",
        "- `年均换仓`：平均每年切换持仓的次数。",
        "",
        "## 排名表",
        "",
        "| " + " | ".join(cols.values()) + " |",
        "| " + " | ".join(["---"] * len(cols)) + " |",
    ]
    for _, row in summary[list(cols.keys())].iterrows():
        values = []
        for col in cols:
            value = row[col]
            if col == "risk_flag" and value == "HIGH_DD":
                values.append("高回撤")
            elif col in {"rolling_1y_win_rate", "rolling_3y_win_rate", "rolling_5y_win_rate"} and isinstance(value, float):
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
                f"{note}{risk}。年化收益 `{row['cagr_pct']:.2f}%`，最大回撤 `{row['max_drawdown_pct']:.2f}%`，滚动 1/3/5 年胜率 `{row['rolling_1y_win_rate']:.2%}` / `{row['rolling_3y_win_rate']:.2%}` / `{row['rolling_5y_win_rate']:.2%}`，综合分 `{row['score']:.2f}`。",
                "",
            ]
        )
    return "\n".join(lines)


def write_markdown(markdown: str, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown, encoding="utf-8")


def build_json_payload(
    summary: pd.DataFrame,
    latest_bar_date: str,
    generated_at: str,
    data_audit: dict[str, dict[str, object]],
    config: StrategyValidationConfig,
) -> dict[str, Any]:
    contribution_cols = [col for col in summary.columns if col.startswith("score_contribution_")]
    rows = []
    for row in summary.to_dict(orient="records"):
        contributions = {col.replace("score_contribution_", ""): row.pop(col) for col in contribution_cols}
        row["score_contributions"] = contributions
        rows.append(row)
    return {
        "metadata": {
            "latest_bar_date": latest_bar_date,
            "generated_at": generated_at,
            "report_type": config.report_type,
            "report_title": config.report_title,
            "signal_symbol": config.symbols.signal,
            "risk_symbol": config.symbols.risk,
        },
        "data_audit": data_audit,
        "summary": rows,
        "config": config.raw,
    }


def write_json(payload: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
