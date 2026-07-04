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
