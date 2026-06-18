from __future__ import annotations

import argparse
import os
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from strategy_validation.config import DEFAULT_CONFIG_PATH, SymbolConfig, load_config
from strategy_validation.data import build_data_audit, fetch_yahoo_history, prepare_frame
from strategy_validation.engine import run_backtests
from strategy_validation.metrics import build_summary
from strategy_validation.notion import upsert_notion_entry
from strategy_validation.reporting import build_json_payload, build_markdown, write_json, write_markdown


LA_TZ = ZoneInfo("America/Los_Angeles")


def log(message: str) -> None:
    timestamp = datetime.now(LA_TZ).isoformat(timespec="seconds")
    print(f"[{timestamp}] {message}", flush=True)


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


def load_env_value(cli_value: str | None, env_name: str) -> str | None:
    return cli_value if cli_value else os.getenv(env_name)


def resolve_from_project_root(project_root: Path, path_value: str) -> Path:
    path = Path(path_value)
    return path if path.is_absolute() else project_root / path


def apply_symbol_overrides(config, signal_symbol: str | None, risk_symbol: str | None):
    if not signal_symbol and not risk_symbol:
        return config
    signal = signal_symbol.upper() if signal_symbol else config.symbols.signal
    risk = risk_symbol.upper() if risk_symbol else config.symbols.risk
    raw = dict(config.raw)
    raw["symbols"] = {**dict(raw.get("symbols", {})), "signal": signal, "risk": risk, "cash": config.symbols.cash}
    raw["report_title"] = f"{signal} / {risk} 策略周度验证"
    return replace(
        config,
        report_title=raw["report_title"],
        symbols=SymbolConfig(signal=signal, risk=risk, cash=config.symbols.cash),
        raw=raw,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Config-driven strategy validation using Yahoo chart API and optional Notion upload.")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="Strategy validation JSON config path.")
    parser.add_argument("--output-dir", default="outputs/strategy-validation", help="Directory for report outputs. Relative paths are resolved from the project root.")
    parser.add_argument("--notion-token", help="Optional Notion token. Falls back to NOTION_TOKEN env var.")
    parser.add_argument("--notion-database-id", help="Optional Notion database id. Falls back to NOTION_DATABASE_ID env var.")
    parser.add_argument("--signal-symbol", help="Override signal symbol from config, e.g. NVDA.")
    parser.add_argument("--risk-symbol", help="Override risk/leveraged symbol from config, e.g. NVDL.")
    parser.add_argument("--min-rows", type=int, default=1260, help="Minimum merged rows required before running. Default 1260.")
    parser.add_argument("--skip-notion", action="store_true", help="Skip Notion upload even if env vars are set.")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    log(f"start weekly strategy validation; project_root={project_root}")
    load_dotenv_file(project_root / ".env")

    config_path = resolve_from_project_root(project_root, args.config)
    log(f"loading config: {config_path}")
    config = load_config(config_path)
    config = apply_symbol_overrides(config, args.signal_symbol, args.risk_symbol)
    if args.signal_symbol or args.risk_symbol:
        log(f"applied symbol overrides: signal={config.symbols.signal}, risk={config.symbols.risk}")

    log(f"fetching Yahoo data: {config.symbols.signal}, range={config.yahoo_range}")
    signal = fetch_yahoo_history(config.symbols.signal, config.yahoo_range)
    log(f"fetched {config.symbols.signal}: rows={len(signal)}, start={signal['date'].iloc[0].date()}, end={signal['date'].iloc[-1].date()}")
    log(f"fetching Yahoo data: {config.symbols.risk}, range={config.yahoo_range}")
    risk = fetch_yahoo_history(config.symbols.risk, config.yahoo_range)
    log(f"fetched {config.symbols.risk}: rows={len(risk)}, start={risk['date'].iloc[0].date()}, end={risk['date'].iloc[-1].date()}")

    log("preparing merged OHLC frame and indicators")
    df = prepare_frame(signal, risk)
    if len(df) < args.min_rows:
        raise RuntimeError(f"Data insufficient after merge: rows={len(df)}, min_rows={args.min_rows}")
    log(f"merged frame ready: rows={len(df)}, start={df['date'].iloc[0].date()}, end={df['date'].iloc[-1].date()}")

    log("running strategy backtests")
    baseline, results = run_backtests(df, config)
    log(f"backtests complete: strategies={len(results)}")
    start = df["date"].iloc[0].date().isoformat()
    latest_bar_date = df["date"].iloc[-1].date().isoformat()
    generated_at = datetime.now(LA_TZ).isoformat(timespec="seconds")
    report_date = datetime.now(LA_TZ).date().isoformat()
    data_audit = build_data_audit(config.symbols.signal, config.symbols.risk, signal, risk, df)
    log("computing summary metrics and scores")
    summary = build_summary(results, baseline, start, latest_bar_date, config)
    log(f"summary ready: rows={len(summary)}, top_strategy={summary.iloc[0]['strategy']}")

    output_dir = resolve_from_project_root(project_root, args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    md_path = output_dir / f"strategy_validation_{latest_bar_date}.md"
    json_path = output_dir / f"strategy_validation_{latest_bar_date}.json"
    latest_json_path = output_dir / "latest.json"

    if config.outputs.markdown:
        log(f"writing markdown: {md_path}")
        markdown = build_markdown(summary, latest_bar_date, generated_at, data_audit, config)
        write_markdown(markdown, md_path)
    if config.outputs.json:
        log(f"writing json: {json_path}")
        payload = build_json_payload(summary, latest_bar_date, generated_at, data_audit, config)
        write_json(payload, json_path)
        write_json(payload, latest_json_path)
        log(f"writing latest json: {latest_json_path}")
    if config.outputs.csv:
        log("writing csv output")
        summary.to_csv(output_dir / f"strategy_validation_{latest_bar_date}.csv", index=False)

    notion_url = "NONE"
    notion_results_database_url = "NONE"
    notion_warning = ""
    notion_token = load_env_value(args.notion_token, "NOTION_TOKEN")
    notion_database_id = load_env_value(args.notion_database_id, "NOTION_DATABASE_ID")
    if not args.skip_notion and notion_token and notion_database_id:
        log("uploading to Notion")
        notion_url, notion_results_database_url = upsert_notion_entry(
            notion_database_id,
            notion_token,
            report_date,
            summary,
            latest_bar_date,
            generated_at,
            data_audit,
            str(summary.iloc[0]["strategy"]),
            config,
        )
        log(f"notion upload complete: report_url={notion_url}, table_url={notion_results_database_url}")
    elif not args.skip_notion:
        missing = []
        if not notion_token:
            missing.append("NOTION_TOKEN")
        if not notion_database_id:
            missing.append("NOTION_DATABASE_ID")
        notion_warning = f"notion skipped: missing {', '.join(missing)}"
        log(notion_warning)
    else:
        log("notion upload skipped by --skip-notion")

    print(f"latest_bar_date={latest_bar_date}")
    if config.outputs.markdown:
        print(f"markdown_path={md_path}")
    if config.outputs.json:
        print(f"json_path={json_path}")
        print(f"latest_json_path={latest_json_path}")
    print(f"top_strategy={summary.iloc[0]['strategy']}")
    if notion_warning:
        print(notion_warning)
    print(f"notion_url={notion_url}")
    print(f"notion_results_database_url={notion_results_database_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
