import unittest
from unittest.mock import patch

import pandas as pd

import app


def strategy(cape_enabled=True):
    return {
        "id": "cape-test",
        "name": "CAPE test",
        "signalAsset": "QQQ",
        "riskAsset": "TQQQ",
        "fallbackAsset": "QQQ",
        "entry": {"logic": "and", "rules": [{"type": "macd_cross", "fast": 2, "slow": 3, "signal": 2}]},
        "exit": {"logic": "and", "rules": [{"type": "ma_break", "maType": "ema", "window": 2}]},
        "riskFilter": {"cape": {"enabled": cape_enabled, "max": 30}},
    }


class CapeRiskFilterTest(unittest.TestCase):
    def test_parses_cape_table_cells(self):
        html = """
        <table>
          <tr><td>Jan 1, 2024</td><td>31.25</td></tr>
          <tr><td>Dec 1, 2023</td><td>29.75</td></tr>
        </table>
        """

        frame = app.parse_cape_history_html(html)

        self.assertEqual(frame["cape"].tolist(), [29.75, 31.25])

    def test_monthly_cape_is_not_available_until_next_month(self):
        bars = pd.DataFrame({"date": pd.to_datetime(["2024-01-31", "2024-02-01", "2024-02-02"])})
        cape = pd.DataFrame({"date": pd.to_datetime(["2024-01-01"]), "cape": [29.5]})

        aligned = app.attach_cape_history(bars, cape)

        self.assertTrue(pd.isna(aligned.loc[0, "cape"]))
        self.assertEqual(aligned.loc[1:, "cape"].tolist(), [29.5, 29.5])

    def test_cape_recovery_reenters_risk_without_a_new_entry_cross(self):
        dates = pd.date_range("2024-01-02", periods=6, freq="B")
        frame = pd.DataFrame(
            {
                "date": dates,
                "QQQ_open": [100, 100, 101, 102, 103, 104],
                "QQQ_close": [100, 101, 102, 103, 104, 105],
                "TQQQ_open": [100, 100, 102, 104, 106, 108],
                "TQQQ_close": [100, 102, 104, 106, 108, 110],
                "cape": [31, 31, 31, 29, 29, 29],
            }
        )
        entry = pd.Series([False, True, False, False, False, False])
        exit_ = pd.Series(False, index=frame.index)
        diagnostics = {
            "conditions": [],
            "logic": "AND",
            "primaryPassed": False,
            "requirePositiveHist": False,
            "histPositive": False,
            "primaryLabel": "Exit signal",
        }
        benchmark = {"cagrPct": 0}

        with (
            patch.object(app, "build_entry_signal", return_value=entry),
            patch.object(app, "build_exit_signal", return_value=(exit_, diagnostics)),
        ):
            result = app.run_strategy(frame, strategy(), 0, benchmark)

        self.assertEqual(len(result["trades"]), 1)
        self.assertEqual(result["trades"][0]["to"], "TQQQ")
        self.assertEqual(result["trades"][0]["reason"], "CAPE risk filter cleared")
        self.assertEqual(result["trades"][0]["signalDate"], dates[3].date().isoformat())


if __name__ == "__main__":
    unittest.main()
