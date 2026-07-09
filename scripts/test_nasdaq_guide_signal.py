import unittest

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


if __name__ == "__main__":
    unittest.main()
