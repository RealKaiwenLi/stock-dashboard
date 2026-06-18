from __future__ import annotations

import json
from datetime import datetime
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pandas as pd


YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart"


def yahoo_chart_url(symbol: str, range_: str = "25y") -> str:
    query = urlencode(
        {
            "interval": "1d",
            "range": range_,
            "includePrePost": "false",
            "events": "div,splits",
        }
    )
    return f"{YAHOO_CHART_BASE_URL}/{symbol}?{query}"


def fetch_yahoo_history(symbol: str, range_: str = "25y", max_retries: int = 3) -> pd.DataFrame:
    request = Request(
        yahoo_chart_url(symbol, range_),
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
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
        raise RuntimeError(f"Yahoo chart API request failed for {symbol}: {last_error}")

    result = payload["chart"]["result"][0]
    quote = result["indicators"]["quote"][0]
    records = []
    for ts, open_, high_, low_, close_, volume_ in zip(
        result["timestamp"],
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


def prepare_frame(signal: pd.DataFrame, risk: pd.DataFrame) -> pd.DataFrame:
    signal = signal[["date", "open", "close"]].rename(columns={"open": "signal_open", "close": "signal_close"})
    risk = risk[["date", "open", "close"]].rename(columns={"open": "risk_open", "close": "risk_close"})

    signal["sma50"] = signal["signal_close"].rolling(50).mean()
    signal["sma200"] = signal["signal_close"].rolling(200).mean()

    df = signal.merge(risk, on="date", how="inner")
    df["signal_cc"] = df["signal_close"] / df["signal_close"].shift(1)
    df["risk_cc"] = df["risk_close"] / df["risk_close"].shift(1)
    df["signal_ov"] = df["signal_open"] / df["signal_close"].shift(1)
    df["risk_ov"] = df["risk_open"] / df["risk_close"].shift(1)
    df["signal_id"] = df["signal_close"] / df["signal_open"]
    df["risk_id"] = df["risk_close"] / df["risk_open"]
    required = ["signal_cc", "risk_cc", "signal_ov", "risk_ov", "signal_id", "risk_id"]
    return df.dropna(subset=required).reset_index(drop=True)


def frame_audit(df: pd.DataFrame) -> dict[str, object]:
    return {
        "start": df["date"].iloc[0].date().isoformat(),
        "end": df["date"].iloc[-1].date().isoformat(),
        "rows": len(df),
    }


def build_data_audit(signal_symbol: str, risk_symbol: str, signal: pd.DataFrame, risk: pd.DataFrame, merged: pd.DataFrame) -> dict[str, dict[str, object]]:
    return {
        signal_symbol: frame_audit(signal),
        risk_symbol: frame_audit(risk),
        "共同可用区间": frame_audit(merged),
    }

