import unittest
from unittest.mock import patch

import pandas as pd

from scripts.nasdaq_guide_signal import compute_hold_signal, signal_table_rows


class NasdaqGuideSignalTableTest(unittest.TestCase):
    def test_macd_explanations_use_active_model_parameters(self):
        dates = pd.date_range("2025-01-02", periods=100, freq="B")
        frame = pd.DataFrame(
            {
                "date": dates,
                "close": [100 + index * 0.5 for index in range(len(dates))],
            }
        )
        config = {
            "active_model_version": "test",
            "model_versions": {
                "test": {
                    "version": "test",
                    "name": "Dynamic MACD",
                    "signal_symbol": "QQQ",
                    "risk_symbol": "TQQQ",
                    "macd": {"fast": 24, "slow": 60, "signal": 5},
                    "exit_ema": 15,
                    "exit_requires_positive_hist": True,
                }
            },
        }

        result = compute_hold_signal(frame, config)
        notes_by_label = {label: note for label, _, note in signal_table_rows(result)}

        self.assertEqual(notes_by_label["MACD"], "EMA24 - EMA60")
        self.assertEqual(notes_by_label["Signal"], "MACD 线的 EMA5")

    def test_position_start_date_resets_holding_without_resetting_indicators(self):
        frame = pd.DataFrame(
            {
                "date": pd.to_datetime(["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03"]),
                "close": [100.0] * 5,
            }
        )
        macd = pd.DataFrame(
            {
                "macd": [0.0, 2.0, 2.0, 2.0, 2.0],
                "signal": [1.0, 1.0, 1.0, 1.0, 1.0],
                "hist": [-1.0, 1.0, 1.0, 1.0, 1.0],
            }
        )
        base_model = {
            "version": "test",
            "name": "Position start",
            "signal_symbol": "QQQ",
            "risk_symbol": "TQQQ",
            "macd": {"fast": 24, "slow": 60, "signal": 5},
            "exit_ema": 15,
            "exit_requires_positive_hist": True,
        }
        continuous_config = {"model": base_model}
        reset_config = {"model": {**base_model, "position_start_date": "2026-07-01"}}

        with patch("scripts.nasdaq_guide_signal.compute_macd", return_value=macd):
            continuous = compute_hold_signal(frame, continuous_config)
            reset = compute_hold_signal(frame, reset_config)

        self.assertEqual(continuous["hold_after_close"], "TQQQ")
        self.assertEqual(reset["hold_after_close"], "QQQ")
        self.assertEqual(reset["position_start_date"], "2026-07-01")
        self.assertEqual(reset["position_start_bar_date"], "2026-07-01")
        rows = {label: value for label, value, _ in signal_table_rows(reset)}
        self.assertEqual(rows["持仓起算日"], "2026-07-01")
        self.assertEqual(rows["实际起算交易日"], "2026-07-01")

    def test_position_start_date_after_latest_bar_is_rejected(self):
        frame = pd.DataFrame(
            {
                "date": pd.to_datetime(["2026-07-01", "2026-07-02"]),
                "close": [100.0, 101.0],
            }
        )
        config = {
            "model": {
                "version": "test",
                "name": "Future start",
                "signal_symbol": "QQQ",
                "risk_symbol": "TQQQ",
                "macd": {"fast": 24, "slow": 60, "signal": 5},
                "exit_ema": 15,
                "exit_requires_positive_hist": True,
                "position_start_date": "2026-08-01",
            }
        }

        with self.assertRaisesRegex(ValueError, "position_start_date"):
            compute_hold_signal(frame, config)

    def test_non_trading_position_start_date_uses_next_available_bar(self):
        frame = pd.DataFrame(
            {
                "date": pd.to_datetime(["2026-07-03", "2026-07-06", "2026-07-07"]),
                "close": [100.0, 100.0, 100.0],
            }
        )
        config = {
            "model": {
                "version": "test",
                "name": "Weekend start",
                "signal_symbol": "QQQ",
                "risk_symbol": "TQQQ",
                "macd": {"fast": 24, "slow": 60, "signal": 5},
                "exit_ema": 15,
                "exit_requires_positive_hist": True,
                "position_start_date": "2026-07-04",
            }
        }

        result = compute_hold_signal(frame, config)

        self.assertEqual(result["position_start_date"], "2026-07-04")
        self.assertEqual(result["position_start_bar_date"], "2026-07-06")
        self.assertEqual(result["hold_after_close"], "QQQ")


if __name__ == "__main__":
    unittest.main()
