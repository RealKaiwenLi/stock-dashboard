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


def parse_symbol_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip().upper() for item in value.split(",") if item.strip()]


def combined_config(config, risk_symbols: list[str]):
    if len(risk_symbols) <= 1:
        return config
    risk_label = ", ".join(risk_symbols)
    raw = dict(config.raw)
    raw["symbols"] = {**dict(raw.get("symbols", {})), "signal": config.symbols.signal, "risk": risk_label, "cash": config.symbols.cash}
    raw["report_title"] = f"{config.symbols.signal} / {' + '.join(risk_symbols)} 策略周度验证"
    return replace(
        config,
        report_title=raw["report_title"],
        symbols=SymbolConfig(signal=config.symbols.signal, risk=risk_label, cash=config.symbols.cash),
        raw=raw,
    )


def fetch_symbol_history(symbol: str, range_: str):
    log(f"fetching Yahoo data: {symbol}, range={range_}")
    history = fetch_yahoo_history(symbol, range_)
    log(f"fetched {symbol}: rows={len(history)}, start={history['date'].iloc[0].date()}, end={history['date'].iloc[-1].date()}")
    return history


def common_history_range(histories):
    starts = [history["date"].iloc[0] for history in histories]
    ends = [history["date"].iloc[-1] for history in histories]
    return max(starts), min(ends)


def common_backtest_range(signal, risk_histories):
    frames = [prepare_frame(signal, risk) for risk in risk_histories.values()]
    starts = [frame["date"].iloc[0] for frame in frames]
    ends = [frame["date"].iloc[-1] for frame in frames]
    return max(starts), min(ends)


def run_validation_for_config(config, min_rows: int, signal=None, risk=None, common_start=None, common_end=None):
    if signal is None:
        signal = fetch_symbol_history(config.symbols.signal, config.yahoo_range)
    else:
        log(f"using prefetched {config.symbols.signal}: rows={len(signal)}, start={signal['date'].iloc[0].date()}, end={signal['date'].iloc[-1].date()}")
    if risk is None:
        risk = fetch_symbol_history(config.symbols.risk, config.yahoo_range)
    else:
        log(f"using prefetched {config.symbols.risk}: rows={len(risk)}, start={risk['date'].iloc[0].date()}, end={risk['date'].iloc[-1].date()}")

    log("preparing merged OHLC frame and indicators")
    df = prepare_frame(signal, risk)
    if common_start is not None or common_end is not None:
        start_label = common_start.date().isoformat() if common_start is not None else df["date"].iloc[0].date().isoformat()
        end_label = common_end.date().isoformat() if common_end is not None else df["date"].iloc[-1].date().isoformat()
        mask = df["date"].notna()
        if common_start is not None:
            mask &= df["date"] >= common_start
        if common_end is not None:
            mask &= df["date"] <= common_end
        df = df[mask].reset_index(drop=True)
        log(f"restricted merged frame to common range: start={start_label}, end={end_label}, rows={len(df)}")
    if len(df) < min_rows:
        raise RuntimeError(f"Data insufficient after merge: rows={len(df)}, min_rows={min_rows}")
    log(f"merged frame ready: rows={len(df)}, start={df['date'].iloc[0].date()}, end={df['date'].iloc[-1].date()}")

    log("running strategy backtests")
    baseline, results = run_backtests(df, config)
    log(f"backtests complete: strategies={len(results)}")
    start = df["date"].iloc[0].date().isoformat()
    latest_bar_date = df["date"].iloc[-1].date().isoformat()
    data_audit = build_data_audit(config.symbols.signal, config.symbols.risk, signal, risk, df)
    log("computing summary metrics and scores")
    summary = build_summary(results, baseline, start, latest_bar_date, config)
    log(f"summary ready: rows={len(summary)}, top_strategy={summary.iloc[0]['strategy']}")
    return summary, latest_bar_date, data_audit


def combine_summaries(items):
    import pandas as pd

    summary = pd.concat([item["summary"] for item in items], ignore_index=True)
    if "rank" in summary.columns:
        summary = summary.drop(columns=["rank"])
    summary = summary.drop_duplicates(subset=["strategy"], keep="first")
    summary = summary.sort_values(["score", "cagr_pct"], ascending=False).reset_index(drop=True)
    summary.insert(0, "rank", range(1, len(summary) + 1))
    latest_bar_date = min(item["latest_bar_date"] for item in items)
    data_audit = {}
    for item in items:
        risk = item["risk_symbol"]
        for key, value in item["data_audit"].items():
            data_audit[f"{risk} / {key}"] = value
    return summary, latest_bar_date, data_audit


def main() -> int:
    parser = argparse.ArgumentParser(description="Config-driven strategy validation using Yahoo chart API and optional Notion upload.")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="Strategy validation JSON config path.")
    parser.add_argument("--output-dir", default="outputs/strategy-validation", help="Directory for report outputs. Relative paths are resolved from the project root.")
    parser.add_argument("--notion-token", help="Optional Notion token. Falls back to NOTION_TOKEN env var.")
    parser.add_argument("--notion-database-id", help="Optional Notion database id. Falls back to NOTION_DATABASE_ID env var.")
    parser.add_argument("--signal-symbol", help="Override signal symbol from config, e.g. NVDA.")
    parser.add_argument("--risk-symbol", help="Override risk/leveraged symbol from config, e.g. NVDL.")
    parser.add_argument("--risk-symbols", help="Comma-separated risk symbols to include in one combined report, e.g. QLD,TQQQ.")
    parser.add_argument("--min-rows", type=int, default=1260, help="Minimum merged rows required before running. Default 1260.")
    parser.add_argument("--skip-notion", action="store_true", help="Skip Notion upload even if env vars are set.")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    log(f"start weekly strategy validation; project_root={project_root}")
    load_dotenv_file(project_root / ".env")

    config_path = resolve_from_project_root(project_root, args.config)
    log(f"loading config: {config_path}")
    config = load_config(config_path)
    risk_symbols = parse_symbol_list(args.risk_symbols)
    if args.risk_symbol and risk_symbols:
        raise ValueError("Use either --risk-symbol or --risk-symbols, not both")
    if risk_symbols:
        if args.signal_symbol:
            config = apply_symbol_overrides(config, args.signal_symbol, None)
        log(f"running combined report for risk symbols: {', '.join(risk_symbols)}")
        signal_history = fetch_symbol_history(config.symbols.signal, config.yahoo_range)
        risk_histories = {risk_symbol: fetch_symbol_history(risk_symbol, config.yahoo_range) for risk_symbol in risk_symbols}
        raw_common_start, raw_common_end = common_history_range([signal_history, *risk_histories.values()])
        log(f"combined raw data range: start={raw_common_start.date()}, end={raw_common_end.date()}")
        common_start, common_end = common_backtest_range(signal_history, risk_histories)
        log(f"combined common backtest range: start={common_start.date()}, end={common_end.date()}")
        run_items = []
        for risk_symbol in risk_symbols:
            risk_config = apply_symbol_overrides(config, None, risk_symbol)
            log(f"running risk universe: {risk_symbol}")
            summary, item_latest_bar_date, item_data_audit = run_validation_for_config(
                risk_config,
                args.min_rows,
                signal=signal_history,
                risk=risk_histories[risk_symbol],
                common_start=common_start,
                common_end=common_end,
            )
            run_items.append(
                {
                    "risk_symbol": risk_symbol,
                    "summary": summary,
                    "latest_bar_date": item_latest_bar_date,
                    "data_audit": item_data_audit,
                }
            )
        config = combined_config(config, risk_symbols)
        summary, latest_bar_date, data_audit = combine_summaries(run_items)
        log(f"combined summary ready: rows={len(summary)}, top_strategy={summary.iloc[0]['strategy']}")
    else:
        config = apply_symbol_overrides(config, args.signal_symbol, args.risk_symbol)
        if args.signal_symbol or args.risk_symbol:
            log(f"applied symbol overrides: signal={config.symbols.signal}, risk={config.symbols.risk}")
        summary, latest_bar_date, data_audit = run_validation_for_config(config, args.min_rows)

    generated_at = datetime.now(LA_TZ).isoformat(timespec="seconds")
    report_date = datetime.now(LA_TZ).date().isoformat()

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
