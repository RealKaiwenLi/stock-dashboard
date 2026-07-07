from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


NOTION_VERSION = "2022-06-28"
LA_TZ = ZoneInfo("America/Los_Angeles")
CACHE_TTL_SECONDS = 15 * 60
_CACHE: dict[tuple[str, str, str], tuple[datetime, dict[str, Any]]] = {}


class DailyRecommendationError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 502):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass(frozen=True)
class DateRange:
    start: date
    end: date


LABEL_KEY_MAP = {
    "模型版本": "modelVersion",
    "最新完成日线日期": "latestBarDate",
    "最新收盘价": "latestClose",
    "当前收盘后状态": "holdAfterClose",
    "次日开盘动作": "action",
    "次日开盘应持有": "holdForNextOpen",
    "MACD": "macd",
    "Signal": "signal",
    "Hist": "hist",
    "当日金叉": "signalGoldenCross",
    "当日 Hist > 0": "histPositive",
    "当日完整退出信号": "fullExitSignal",
}


def parse_date_range(from_value: str | None, to_value: str | None, now: datetime | None = None) -> DateRange:
    today = (now or datetime.now(LA_TZ)).date()
    default_start = today.replace(day=1)
    if default_start.month == 12:
        default_end = default_start.replace(year=default_start.year + 1, month=1, day=1)
    else:
        default_end = default_start.replace(month=default_start.month + 1, day=1)
    default_end = date.fromordinal(default_end.toordinal() - 1)

    try:
        start = date.fromisoformat(from_value) if from_value else default_start
        end = date.fromisoformat(to_value) if to_value else default_end
    except ValueError as exc:
        raise DailyRecommendationError("INVALID_DATE_RANGE", "Date range must use YYYY-MM-DD.", 400) from exc
    if start > end:
        raise DailyRecommendationError("INVALID_DATE_RANGE", "from must be before or equal to to.", 400)
    return DateRange(start=start, end=end)


def notion_request(method: str, url: str, token: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
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
        if exc.code in {401, 403}:
            raise DailyRecommendationError("NOTION_UNAUTHORIZED", "Notion credentials cannot access the database.", 502) from exc
        body = exc.read().decode("utf-8", errors="replace")
        raise DailyRecommendationError("NOTION_REQUEST_FAILED", f"Notion API {exc.code}: {body}", 502) from exc
    except (URLError, TimeoutError) as exc:
        raise DailyRecommendationError("NOTION_REQUEST_FAILED", f"Notion request failed: {exc}", 502) from exc


def build_query_payload(date_range: DateRange, start_cursor: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "filter": {
            "and": [
                {"property": "报告类型", "select": {"equals": "纳斯达克指引"}},
                {"property": "Date", "date": {"on_or_after": date_range.start.isoformat()}},
                {"property": "Date", "date": {"on_or_before": date_range.end.isoformat()}},
            ]
        },
        "sorts": [{"property": "Date", "direction": "ascending"}],
        "page_size": 100,
    }
    if start_cursor:
        payload["start_cursor"] = start_cursor
    return payload


def query_pages(database_id: str, token: str, date_range: DateRange) -> list[dict[str, Any]]:
    pages: list[dict[str, Any]] = []
    cursor = None
    while True:
        response = notion_request(
            "POST",
            f"https://api.notion.com/v1/databases/{database_id}/query",
            token,
            build_query_payload(date_range, cursor),
        )
        pages.extend(response.get("results", []))
        if not response.get("has_more"):
            return pages
        cursor = response.get("next_cursor")


def list_children(block_id: str, token: str) -> list[dict[str, Any]]:
    children: list[dict[str, Any]] = []
    cursor = None
    while True:
        url = f"https://api.notion.com/v1/blocks/{block_id}/children?page_size=100"
        if cursor:
            url += f"&start_cursor={cursor}"
        response = notion_request("GET", url, token)
        children.extend(response.get("results", []))
        if not response.get("has_more"):
            return children
        cursor = response.get("next_cursor")


def rich_text_plain(items: list[dict[str, Any]] | None) -> str:
    return "".join(item.get("plain_text", "") for item in (items or [])).strip()


def property_title(properties: dict[str, Any]) -> str:
    prop = properties.get("Doc name", {})
    return rich_text_plain(prop.get("title", []))


def property_rich_text(properties: dict[str, Any], name: str) -> str:
    prop = properties.get(name, {})
    return rich_text_plain(prop.get("rich_text", []))


def parse_holding_from_title(title: str) -> str | None:
    match = re.search(r"\b([A-Z]{2,5}|CASH)\b$", title.strip())
    return match.group(1) if match else None


def parse_bool(value: str) -> bool | None:
    normalized = value.strip().lower()
    if normalized in {"是", "yes", "true", "1"}:
        return True
    if normalized in {"否", "no", "false", "0"}:
        return False
    return None


def parse_number(value: str) -> float | None:
    try:
        return float(value.replace(",", ""))
    except ValueError:
        return None


def normalize_value(key: str, value: str) -> Any:
    if key in {"signalGoldenCross", "histPositive", "fullExitSignal", "priceBelowExitEma"}:
        return parse_bool(value)
    if key in {"latestClose", "macd", "signal", "hist", "exitEma"}:
        return parse_number(value)
    return value or None


def parse_table_rows(table_rows: list[dict[str, Any]]) -> dict[str, Any]:
    parsed: dict[str, Any] = {}
    for row in table_rows:
        cells = row.get("table_row", {}).get("cells", [])
        if len(cells) < 2:
            continue
        label = rich_text_plain(cells[0])
        value = rich_text_plain(cells[1]).strip("`")
        key = LABEL_KEY_MAP.get(label)
        if key:
            parsed[key] = normalize_value(key, value)
        elif re.fullmatch(r"EMA\d+", label):
            parsed["exitEmaLabel"] = label
            parsed["exitEma"] = normalize_value("exitEma", value)
        elif re.fullmatch(r"收盘价低于 EMA\d+", label):
            parsed["priceBelowExitEma"] = normalize_value("priceBelowExitEma", value)
    return parsed


def block_text(block: dict[str, Any]) -> str:
    block_type = block.get("type")
    if not block_type:
        return ""
    return rich_text_plain(block.get(block_type, {}).get("rich_text", []))


def parse_page_blocks(page_id: str, token: str) -> dict[str, Any]:
    children = list_children(page_id, token)
    details: dict[str, Any] = {}
    explanation_parts: list[str] = []
    in_explanation = False
    for block in children:
        block_type = block.get("type")
        text = block_text(block)
        if block_type == "heading_2":
            in_explanation = text == "判断说明"
        elif block_type == "table":
            table_rows = list_children(block["id"], token)
            details.update(parse_table_rows(table_rows))
        elif in_explanation and block_type == "paragraph" and text:
            explanation_parts.append(text)
    if explanation_parts:
        details["explanation"] = "\n".join(explanation_parts)
    return details


def parse_page(page: dict[str, Any], token: str) -> dict[str, Any] | None:
    properties = page.get("properties", {})
    title = property_title(properties)
    date_prop = properties.get("Date", {}).get("date", {})
    report_date = date_prop.get("start")
    recommended = property_rich_text(properties, "Key Tickers") or parse_holding_from_title(title)
    if not report_date or not recommended:
        return None

    status_prop = properties.get("Status", {}).get("select") or {}
    item = {
        "date": report_date,
        "recommendedHolding": recommended,
        "holdForNextOpen": recommended,
        "action": "HOLD",
        "status": status_prop.get("name"),
        "notionUrl": page.get("url"),
    }
    item.update(parse_page_blocks(page["id"], token))
    item["recommendedHolding"] = item.get("holdForNextOpen") or item["recommendedHolding"]
    return item


def fetch_daily_recommendations(
    database_id: str,
    token: str,
    date_range: DateRange,
    now: datetime | None = None,
) -> dict[str, Any]:
    current_time = now or datetime.now(LA_TZ)
    cache_key = (database_id, date_range.start.isoformat(), date_range.end.isoformat())
    cached = _CACHE.get(cache_key)
    if cached and (current_time - cached[0]).total_seconds() < CACHE_TTL_SECONDS:
        return cached[1]

    pages = query_pages(database_id, token, date_range)
    items = [item for page in pages if (item := parse_page(page, token))]
    response = {
        "items": items,
        "source": "notion",
        "lastSyncedAt": current_time.isoformat(timespec="seconds"),
        "cacheTtlSeconds": CACHE_TTL_SECONDS,
    }
    _CACHE[cache_key] = (current_time, response)
    return response
