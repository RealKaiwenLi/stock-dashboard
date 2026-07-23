# Backtest Backend

Flask API for running daily-bar strategy backtests.

## Local Development

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
flask --app app run --port 5001
```

The Vite frontend proxies `/api/*` to `http://127.0.0.1:5001` in development.

## Endpoint

```http
POST /api/backtests
```

Runs up to five strategy candidates against Yahoo Finance daily bars.

Strategies can optionally enable a monthly CAPE risk filter:

```json
{
  "riskFilter": {
    "cape": { "enabled": true, "max": 30 }
  }
}
```

CAPE history is loaded from Multpl's Shiller PE table, cached in memory for 24 hours, and delayed until the next calendar month before it can affect a trade.

```http
GET /api/daily-recommendations?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Reads daily Nasdaq guide recommendations from Notion and returns frontend-friendly calendar data. Requires `NOTION_TOKEN` and `NOTION_DATABASE_ID` in the backend environment. The frontend never calls Notion directly. Responses are cached in memory for 15 minutes per date range to keep calendar navigation responsive and reduce Notion API calls.
# Backtest strategy configuration v2

`POST /api/backtests` accepts legacy strategies and versioned strategy configurations. A missing
`postExitReentry` object, or one with `enabled: false`, preserves the legacy execution path.
Active policies use `schemaVersion: 1`, an aligned-trading-day cooldown, `ignore` or
`retain_latest` signal handling, and one of `signal_still_valid`, `revalidate_entry`, or
`rule_group` release validation.

Successful strategy results add `status`, structured `events`, explicit `actualHolding` and
`nextTarget`, deferred/expired/rejected counts, and a `latestSignal.postExitReentry` runtime
snapshot. Existing success fields remain available. Invalid strategy candidates return
`status: "error"` with `{code, path, message}` while other candidates continue.
