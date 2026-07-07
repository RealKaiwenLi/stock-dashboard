from __future__ import annotations

import json
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pandas as pd

from .config import StrategyValidationConfig
from .reporting import data_audit_items, scoring_weights_text


NOTION_VERSION = "2022-06-28"
NOTION_VIEWS_VERSION = "2026-03-11"


def notion_request(
    method: str,
    url: str,
    token: str,
    payload: dict | None = None,
    max_retries: int = 3,
    notion_version: str = NOTION_VERSION,
) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Notion-Version": notion_version,
        },
    )
    for attempt in range(1, max_retries + 1):
        try:
            with urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if exc.code not in {408, 429, 500, 502, 503, 504} or attempt == max_retries:
                raise RuntimeError(f"Notion API {exc.code}: {body}") from exc
            time.sleep(2**attempt)
        except (TimeoutError, URLError) as exc:
            if attempt == max_retries:
                raise RuntimeError(f"Notion API request timed out after {max_retries} attempts: {method} {url}") from exc
            time.sleep(2**attempt)
    raise RuntimeError(f"Notion API request failed: {method} {url}")


def results_table_property_order(config: StrategyValidationConfig) -> list[dict]:
    columns = [
        ("策略", 320),
        ("年化收益%", 120),
        ("最大回撤%", 120),
        ("夏普比率", 120),
        ("排名", 90),
        ("综合分", 110),
        ("风险标记", 110),
        ("超额年化%", 120),
        (f"回撤/{config.symbols.signal}", 120),
        ("滚动5年胜率", 140),
        (f"定投领先{config.symbols.signal}%", 150),
        ("文本", 360),
        ("年均换仓", 120),
    ]
    return [{"property_id": name, "visible": True, "width": width} for name, width in columns]


def configure_results_table_view(database_id: str, notion_token: str, config: StrategyValidationConfig) -> None:
    response = notion_request(
        "GET",
        f"https://api.notion.com/v1/views?database_id={database_id}",
        notion_token,
        notion_version=NOTION_VIEWS_VERSION,
    )
    table_view = None
    for view in response.get("results", []):
        view_id = view["id"]
        detail = notion_request(
            "GET",
            f"https://api.notion.com/v1/views/{view_id}",
            notion_token,
            notion_version=NOTION_VIEWS_VERSION,
        )
        if detail.get("type") == "table":
            table_view = detail
            break
    if table_view is None:
        return
    notion_request(
        "PATCH",
        f"https://api.notion.com/v1/views/{table_view['id']}",
        notion_token,
        {
            "sorts": [{"property": "排名", "direction": "ascending"}],
            "configuration": {
                "type": "table",
                "properties": results_table_property_order(config),
                "wrap_cells": False,
                "frozen_column_index": 1,
            },
        },
        notion_version=NOTION_VIEWS_VERSION,
    )


def query_existing_notion_page(database_id: str, notion_token: str, report_date: str, config: StrategyValidationConfig) -> str | None:
    payload = {
        "filter": {
            "and": [
                {"property": "Date", "date": {"equals": report_date}},
                {"property": "报告类型", "select": {"equals": config.report_type}},
            ]
        },
        "page_size": 10,
    }
    response = notion_request("POST", f"https://api.notion.com/v1/databases/{database_id}/query", notion_token, payload)
    results = response.get("results", [])
    return results[0]["id"] if results else None


def build_notion_properties(report_date: str, top_strategy: str, config: StrategyValidationConfig) -> dict:
    title = f"{report_date} {config.report_type}"
    return {
        "Doc name": {"title": [{"text": {"content": title}}]},
        "Date": {"date": {"start": report_date}},
        "报告类型": {"select": {"name": config.report_type}},
        "Key Tickers": {"rich_text": [{"text": {"content": f"{config.symbols.signal}, {config.symbols.risk}"}}]},
        "Status": {"select": {"name": "Ready"}},
    }


def text_rich(content: object) -> list[dict]:
    return [{"type": "text", "text": {"content": str(content)}}]


def paragraph_block(content: object) -> dict:
    return {"object": "block", "type": "paragraph", "paragraph": {"rich_text": text_rich(content)}}


def bulleted_block(content: object, children: list[dict] | None = None) -> dict:
    block = {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": text_rich(content)}}
    if children:
        block["bulleted_list_item"]["children"] = children
    return block


def heading_block(level: int, content: object) -> dict:
    block_type = f"heading_{level}"
    return {"object": "block", "type": block_type, block_type: {"rich_text": text_rich(content)}}


def build_report_intro_blocks(
    latest_bar_date: str,
    generated_at: str,
    data_audit: dict[str, dict[str, object]],
    config: StrategyValidationConfig,
) -> list[dict]:
    return [
        heading_block(1, f"{config.report_title} {latest_bar_date}"),
        bulleted_block(f"生成时间：{generated_at}"),
        bulleted_block("数据源：Yahoo Finance chart API；", [bulleted_block(item) for item in data_audit_items(data_audit, markdown=False)]),
        bulleted_block(f"基准：{config.symbols.signal} Buy & Hold。"),
        bulleted_block(f"执行口径：{config.execution}。"),
        bulleted_block(f"现金收益：{config.cash_return:.2%}；交易成本：0。"),
        bulleted_block(f"评分权重：{scoring_weights_text(config)}。"),
        heading_block(2, "指标说明"),
        bulleted_block("综合分：按权重把各项指标转成 0-100 分后加权，越高越好。"),
        bulleted_block(f"风险标记：高回撤表示该策略最大回撤超过 {config.symbols.signal} 最大回撤的 {config.scoring.max_drawdown_ratio_warn:.1f} 倍。"),
        paragraph_block("本周策略结果写入下面新建的 full-page database。"),
    ]


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


def database_description(latest_bar_date: str, generated_at: str, data_audit: dict[str, dict[str, object]], config: StrategyValidationConfig) -> str:
    audit = "\n".join(f"- {item}" for item in data_audit_items(data_audit, markdown=False))
    return (
        f"{config.report_title} {latest_bar_date}\n\n"
        f"生成时间：{generated_at}\n"
        "数据源：Yahoo Finance chart API\n"
        f"{audit}\n"
        f"基准：{config.symbols.signal} Buy & Hold\n"
        f"执行口径：{config.execution}\n"
        f"现金收益：{config.cash_return:.2%}；交易成本：0\n"
        f"评分权重：{scoring_weights_text(config)}\n\n"
        "指标说明：综合分越高越好；高回撤表示该策略最大回撤超过预设警戒线。"
    )


def create_weekly_results_database(
    page_id: str,
    notion_token: str,
    latest_bar_date: str,
    generated_at: str,
    data_audit: dict[str, dict[str, object]],
    config: StrategyValidationConfig,
) -> tuple[str, str]:
    payload = {
        "parent": {"type": "page_id", "page_id": page_id},
        "icon": {"type": "emoji", "emoji": "📈"},
        "title": [{"type": "text", "text": {"content": f"纳斯达克策略回测排名表 {latest_bar_date}"}}],
        "description": [{"type": "text", "text": {"content": database_description(latest_bar_date, generated_at, data_audit, config)}}],
        "properties": {
            "策略": {"title": {}},
            "年化收益%": {"number": {"format": "number"}},
            "最大回撤%": {"number": {"format": "number"}},
            "夏普比率": {"number": {"format": "number"}},
            "排名": {"number": {"format": "number"}},
            "综合分": {"number": {"format": "number"}},
            "风险标记": {
                "select": {
                    "options": [
                        {"name": "高回撤", "color": "red"},
                    ]
                }
            },
            "超额年化%": {"number": {"format": "number"}},
            f"回撤/{config.symbols.signal}": {"number": {"format": "number"}},
            "滚动5年胜率": {"number": {"format": "number"}},
            f"定投领先{config.symbols.signal}%": {"number": {"format": "number"}},
            "文本": {"rich_text": {}},
            "年均换仓": {"number": {"format": "number"}},
        },
    }
    response = notion_request("POST", "https://api.notion.com/v1/databases", notion_token, payload)
    configure_results_table_view(response["id"], notion_token, config)
    return response["id"], response["url"]


def row_short_note(row: pd.Series) -> str:
    note = str(row["note"]).rstrip("。.;； ")
    risk = "；高回撤" if row["risk_flag"] else ""
    return (
        f"{note}{risk}。年化 {row['cagr_pct']:.2f}%，"
        f"最大回撤 {row['max_drawdown_pct']:.2f}%，"
        f"滚动5年胜率 {row['rolling_5y_win_rate']:.2%}，"
        f"综合分 {row['score']:.2f}。"
    )


def score_contribution_items(row: pd.Series) -> list[str]:
    labels = {
        "score_contribution_rolling_5y_win_rate": "滚动 5 年胜率贡献",
        "score_contribution_excess_cagr": "超额年化贡献",
        "score_contribution_max_drawdown_ratio": "最大回撤贡献",
        "score_contribution_dca_terminal": "定投终值贡献",
        "score_contribution_sharpe": "夏普比率贡献",
        "score_contribution_excess_cagr_per_extra_dd": "超额收益/额外回撤贡献",
        "score_contribution_recovery_days": "恢复时间贡献",
    }
    items = []
    for col, label in labels.items():
        if col in row:
            items.append(f"{label}：{float(row[col]):.2f}")
    return items


def row_detail_children(row: pd.Series, config: StrategyValidationConfig) -> list[dict]:
    risk_text = "高回撤：该策略最大回撤超过预设警戒线。" if row["risk_flag"] else "无高回撤标记。"
    return [
        heading_block(2, "策略逻辑"),
        paragraph_block(str(row["note"])),
        heading_block(2, "本次结果"),
        bulleted_block(f"排名：{int(row['rank'])}"),
        bulleted_block(f"综合分：{row['score']:.2f}"),
        bulleted_block(f"年化收益：{row['cagr_pct']:.2f}%；超额年化：{row['excess_cagr_pct']:.2f}%"),
        bulleted_block(f"最大回撤：{row['max_drawdown_pct']:.2f}%；回撤/{config.symbols.signal}：{row['max_drawdown_ratio_vs_signal']:.2f}"),
        bulleted_block(f"夏普比率：{row['sharpe']:.2f}"),
        bulleted_block(f"滚动 5 年胜率：{row['rolling_5y_win_rate']:.2%}"),
        bulleted_block(f"定投领先 {config.symbols.signal}：{row['dca_vs_signal_pct']:.2f}%"),
        bulleted_block(f"年均换仓：{row['switches_per_year']:.2f}"),
        bulleted_block(risk_text),
        heading_block(2, "评分贡献"),
        *[bulleted_block(item) for item in score_contribution_items(row)],
    ]


def result_row_properties(row: pd.Series, config: StrategyValidationConfig) -> dict:
    properties = {
        "策略": {"title": [{"type": "text", "text": {"content": str(row["strategy"])}}]},
        "年化收益%": {"number": float(row["cagr_pct"])},
        "最大回撤%": {"number": float(row["max_drawdown_pct"])},
        "夏普比率": {"number": float(row["sharpe"])},
        "排名": {"number": int(row["rank"])},
        "综合分": {"number": float(row["score"])},
        "超额年化%": {"number": float(row["excess_cagr_pct"])},
        f"回撤/{config.symbols.signal}": {"number": float(row["max_drawdown_ratio_vs_signal"])},
        "滚动5年胜率": {"number": float(row["rolling_5y_win_rate"] * 100.0)},
        f"定投领先{config.symbols.signal}%": {"number": float(row["dca_vs_signal_pct"])},
        "文本": {"rich_text": [{"type": "text", "text": {"content": row_short_note(row)}}]},
        "年均换仓": {"number": float(row["switches_per_year"])},
    }
    if row["risk_flag"]:
        properties["风险标记"] = {"select": {"name": "高回撤"}}
    else:
        properties["风险标记"] = {"select": None}
    return properties


def create_result_row(database_id: str, notion_token: str, row: pd.Series, config: StrategyValidationConfig) -> None:
    notion_request(
        "POST",
        "https://api.notion.com/v1/pages",
        notion_token,
        {
            "parent": {"database_id": database_id},
            "properties": result_row_properties(row, config),
            "children": row_detail_children(row, config),
        },
    )


def populate_results_database(database_id: str, notion_token: str, summary: pd.DataFrame, config: StrategyValidationConfig) -> None:
    # Notion's default table view has no official API sort configuration.
    # Creating rows from worst to best makes rank 1 appear first in the default UI order.
    for _, row in summary.sort_values("rank", ascending=False).iterrows():
        create_result_row(database_id, notion_token, row, config)


def upsert_notion_entry(
    database_id: str,
    notion_token: str,
    report_date: str,
    summary: pd.DataFrame,
    latest_bar_date: str,
    generated_at: str,
    data_audit: dict[str, dict[str, object]],
    top_strategy: str,
    config: StrategyValidationConfig,
) -> tuple[str, str]:
    page_id = query_existing_notion_page(database_id, notion_token, report_date, config)
    properties = build_notion_properties(report_date, top_strategy, config)
    children = build_report_intro_blocks(latest_bar_date, generated_at, data_audit, config)
    if page_id is None:
        response = notion_request("POST", "https://api.notion.com/v1/pages", notion_token, {"parent": {"database_id": database_id}, "properties": properties})
        page_id = response["id"]
        notion_url = response["url"]
    else:
        notion_request("PATCH", f"https://api.notion.com/v1/pages/{page_id}", notion_token, {"properties": properties})
        archive_existing_children(page_id, notion_token)
        notion_url = f"https://www.notion.so/{page_id.replace('-', '')}"
    for start in range(0, len(children), 100):
        notion_request("PATCH", f"https://api.notion.com/v1/blocks/{page_id}/children", notion_token, {"children": children[start : start + 100]})
    results_database_id, weekly_database_url = create_weekly_results_database(page_id, notion_token, latest_bar_date, generated_at, data_audit, config)
    populate_results_database(results_database_id, notion_token, summary, config)
    return notion_url, weekly_database_url
