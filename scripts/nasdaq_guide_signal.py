from __future__ import annotations

import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import pandas as pd


NOTION_VERSION = "2022-06-28"
LA_TZ = ZoneInfo("America/Los_Angeles")
DEFAULT_CONFIG_PATH = Path(__file__).resolve().with_name("nasdaq_guide_config.json")


def load_config(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def compute_macd(close: pd.Series, fast: int, slow: int, signal: int) -> pd.DataFrame:
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    hist = macd_line - signal_line
    return pd.DataFrame({"macd": macd_line, "signal": signal_line, "hist": hist})


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


def yahoo_chart_url(symbol: str, range_: str) -> str:
    return f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range={range_}&includePrePost=false&events=div%2Csplits"


def fetch_history(symbol: str, range_: str, max_retries: int = 3) -> pd.DataFrame:
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
        raise RuntimeError(f"Yahoo chart API request failed for {symbol} after {max_retries} attempts: {last_error}")

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


def compute_hold_signal(df: pd.DataFrame, config: dict[str, object]) -> dict[str, object]:
    model = config["model"]
    macd_params = model["macd"]
    signal_symbol = str(model["signal_symbol"])
    risk_symbol = str(model["risk_symbol"])
    exit_ema_span = int(model["exit_ema"])
    exit_requires_positive_hist = bool(model.get("exit_requires_positive_hist", True))

    macd = compute_macd(df["close"], int(macd_params["fast"]), int(macd_params["slow"]), int(macd_params["signal"]))
    exit_ema = df["close"].ewm(span=exit_ema_span, adjust=False).mean()
    golden_cross = (macd["macd"] > macd["signal"]) & (macd["macd"].shift(1) <= macd["signal"].shift(1))
    ema_break = df["close"] < exit_ema
    if exit_requires_positive_hist:
        ema_break = ema_break & (macd["hist"] > 0)

    held = signal_symbol
    pending: str | None = None

    for idx in range(1, len(df)):
        if pending is not None:
            held = pending
            pending = None

        if held == signal_symbol and bool(golden_cross.iloc[idx]):
            pending = risk_symbol
        elif held == risk_symbol and bool(ema_break.iloc[idx]):
            pending = signal_symbol

    latest_idx = df.index[-1]
    latest = df.iloc[-1]
    next_open_hold = pending if pending is not None else held
    action = f"SWITCH_TO_{risk_symbol}" if pending == risk_symbol else f"SWITCH_TO_{signal_symbol}" if pending == signal_symbol else "HOLD"

    return {
        "model_name": str(model["name"]),
        "signal_symbol": signal_symbol,
        "risk_symbol": risk_symbol,
        "macd_params": f"{int(macd_params['fast'])},{int(macd_params['slow'])},{int(macd_params['signal'])}",
        "exit_ema_label": f"EMA{exit_ema_span}",
        "latest_bar_date": latest["date"].date().isoformat(),
        "latest_close": round(float(latest["close"]), 4),
        "signal_golden_cross": bool(golden_cross.iloc[latest_idx]),
        "signal_ema_break": bool(ema_break.iloc[latest_idx]),
        "hold_after_close": held,
        "pending_switch_for_next_open": pending or "NONE",
        "hold_for_next_open": next_open_hold,
        "action": action,
        "macd": round(float(macd["macd"].iloc[latest_idx]), 6),
        "signal": round(float(macd["signal"].iloc[latest_idx]), 6),
        "hist": round(float(macd["hist"].iloc[latest_idx]), 6),
        "exit_ema": round(float(exit_ema.iloc[latest_idx]), 6),
        "data_source": f"Yahoo Finance chart API ({signal_symbol})",
        "execution": str(config.get("execution", "T日收盘确认 / T+1开盘成交")),
    }


def resolve_output_path(output_dir: Path, latest_bar_date: str) -> Path:
    return output_dir / f"current_hold_signal_{latest_bar_date}.md"


def write_markdown(result: dict[str, object], output_path: Path) -> None:
    lines = [
        f"# 纳斯达克指引 {result['latest_bar_date']}",
        "",
        f"- 策略：`{result['model_name']}`",
        f"- 执行口径：`{result['execution']}`",
        f"- 数据源：`{result['data_source']}`",
        "",
        f"- 最新完成日线日期：`{result['latest_bar_date']}`",
        f"- 最新收盘价：`{result['latest_close']}`",
        f"- 当前收盘后状态：`{result['hold_after_close']}`",
        f"- 次日开盘动作：`{result['action']}`",
        f"- 次日开盘应持有：`{result['hold_for_next_open']}`",
        f"- MACD：`{result['macd']}`",
        f"- Signal：`{result['signal']}`",
        f"- Hist：`{result['hist']}`",
        f"- {result['exit_ema_label']}：`{result['exit_ema']}`",
        f"- 当日金叉：`{result['signal_golden_cross']}`",
        f"- 当日 {result['exit_ema_label']} 退出信号：`{result['signal_ema_break']}`",
    ]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")


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
                {"property": "报告类型", "select": {"equals": "纳斯达克指引"}},
            ]
        },
        "page_size": 10,
    }
    response = notion_request("POST", f"https://api.notion.com/v1/databases/{database_id}/query", notion_token, payload)
    results = response.get("results", [])
    return results[0]["id"] if results else None


def build_notion_properties(result: dict[str, object], report_date: str) -> tuple[dict, str]:
    hold = str(result["hold_for_next_open"])
    action = str(result["action"])
    title = f"{report_date} 纳斯达克指引 {hold}"
    content = (
        f"次日开盘应持有：{hold} | 动作：{action} | "
        f"MACD={result['macd']} Signal={result['signal']} Hist={result['hist']} {result['exit_ema_label']}={result['exit_ema']}"
    )
    properties = {
        "Doc name": {"title": [{"text": {"content": title}}]},
        "Date": {"date": {"start": report_date}},
        "报告类型": {"select": {"name": "纳斯达克指引"}},
        "Key Tickers": {"rich_text": [{"text": {"content": hold}}]},
        "Status": {"select": {"name": "Ready"}},
    }
    return properties, content


def upsert_notion_entry(database_id: str, notion_token: str, result: dict[str, object]) -> str:
    report_date = datetime.now(LA_TZ).date().isoformat()
    page_id = query_existing_notion_page(database_id, notion_token, report_date)
    properties, content = build_notion_properties(result, report_date)

    if page_id is None:
        payload = {
            "parent": {"database_id": database_id},
            "properties": properties,
            "children": [
                {
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {"rich_text": [{"type": "text", "text": {"content": content}}]},
                }
            ],
        }
        response = notion_request("POST", "https://api.notion.com/v1/pages", notion_token, payload)
        return response["url"]

    notion_request("PATCH", f"https://api.notion.com/v1/pages/{page_id}", notion_token, {"properties": properties})
    return f"https://www.notion.so/{page_id.replace('-', '')}"


def load_env_value(cli_value: str | None, env_name: str) -> str | None:
    return cli_value if cli_value else os.getenv(env_name)


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch QQQ daily data, compute QQQ/QLD hold signal, and optionally upload to Notion.")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="JSON config path for the Nasdaq guide model.")
    parser.add_argument("--output-dir", default="outputs", help="Directory for markdown output.")
    parser.add_argument("--notion-token", help="Optional Notion token. Falls back to NOTION_TOKEN env var.")
    parser.add_argument("--notion-database-id", help="Optional Notion database id. Falls back to NOTION_DATABASE_ID env var.")
    parser.add_argument("--skip-notion", action="store_true", help="Skip Notion upload even if env vars are set.")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    load_dotenv_file(project_root / ".env")
    config_path = Path(args.config)
    if not config_path.is_absolute():
        config_path = project_root / config_path
    config = load_config(config_path)
    data_config = config["data"]

    try:
        df = fetch_history(str(data_config["symbol"]), str(data_config.get("range", "5y")))
    except Exception as exc:
        print("status=DATA_INSUFFICIENT")
        print(f"error=live_fetch_failed:{exc}")
        return 2

    result = compute_hold_signal(df, config)
    output_path = resolve_output_path(Path(args.output_dir), str(result["latest_bar_date"]))
    write_markdown(result, output_path)
    result["markdown_path"] = str(output_path)
    result["notion_url"] = "NONE"

    notion_token = load_env_value(args.notion_token, "NOTION_TOKEN")
    notion_database_id = load_env_value(args.notion_database_id, "NOTION_DATABASE_ID")
    if not args.skip_notion and notion_token and notion_database_id:
        result["notion_url"] = upsert_notion_entry(notion_database_id, notion_token, result)

    for key, value in result.items():
        print(f"{key}={value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
