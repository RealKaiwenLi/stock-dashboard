from __future__ import annotations

import unittest

import pandas as pd

from post_exit_reentry_candidates import Candidate, simulate


def synthetic_panel(rows: int = 8) -> pd.DataFrame:
    dates = pd.bdate_range("2026-01-05", periods=rows)
    panel = pd.DataFrame(
        {
            "date": dates,
            "QQQ_open": [100.0] * rows,
            "QQQ_close": [100.0] * rows,
            "QLD_open": [100.0] * rows,
            "QLD_close": [100.0] * rows,
            "TQQQ_open": [100.0] * rows,
            "TQQQ_close": [100.0] * rows,
            "macd": [1.0] * rows,
            "macd_signal": [0.0] * rows,
            "hist": [-1.0] * rows,
            "golden_cross": [False] * rows,
            "ema_15": [90.0] * rows,
            "ema_20": [90.0] * rows,
            "ema_30": [90.0] * rows,
            "ema_50": [90.0] * rows,
            "sma_150": [90.0] * rows,
            "sma_200": [90.0] * rows,
            "sma_210": [90.0] * rows,
            "momentum_126": [0.1] * rows,
            "momentum_252": [0.1] * rows,
            "vol_10": [0.2] * rows,
            "vol_20": [0.2] * rows,
            "vol_40": [0.2] * rows,
            "vol_60": [0.2] * rows,
        }
    )
    return panel


class ResearchSimulatorTest(unittest.TestCase):
    def test_close_signal_switches_at_next_open(self) -> None:
        panel = synthetic_panel(4)
        panel.loc[1, "golden_cross"] = True
        panel.loc[1, ["QQQ_open", "QQQ_close"]] = [100.0, 110.0]
        panel.loc[2, ["QQQ_open", "QQQ_close"]] = [121.0, 121.0]
        panel.loc[2, ["TQQQ_open", "TQQQ_close"]] = [100.0, 120.0]

        result = simulate(panel, Candidate("current"))

        self.assertEqual(result.held_assets.iloc[1], "QQQ")
        self.assertEqual(result.held_assets.iloc[2], "TQQQ")
        expected = 1.1 * (121.0 / 110.0) * (120.0 / 100.0)
        self.assertAlmostEqual(result.equity.iloc[2], expected)

    def test_cooldown_begins_on_execution_day_and_rearms_signal(self) -> None:
        panel = synthetic_panel(8)
        # Start in risk after a day-1 close signal / day-2 open execution.
        panel.loc[1, "golden_cross"] = True
        # Exit signal at day 2, executed at day 3 open.
        panel.loc[2, "QQQ_close"] = 80.0
        panel.loc[2, "ema_15"] = 90.0
        panel.loc[2, "hist"] = 1.0
        # A new cross occurs one day after the actual exit. It remains armed.
        panel.loc[4, "golden_cross"] = True

        result = simulate(
            panel,
            Candidate("cooldown-rearm", cooldown=2, defer_entry_days=3),
        )

        self.assertEqual(result.held_assets.iloc[3], "QQQ")
        self.assertEqual(result.held_assets.iloc[4], "QQQ")
        self.assertEqual(result.held_assets.iloc[5], "QQQ")
        self.assertEqual(result.held_assets.iloc[6], "QQQ")
        self.assertEqual(result.held_assets.iloc[7], "TQQQ")


if __name__ == "__main__":
    unittest.main()
