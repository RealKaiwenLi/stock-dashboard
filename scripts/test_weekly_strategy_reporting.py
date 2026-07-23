import unittest
from pathlib import Path

import pandas as pd

from scripts.strategy_validation.config import load_config
from scripts.strategy_validation.notion import result_row_properties
from scripts.strategy_validation.reporting import display_columns


class WeeklyStrategyRollingWinRateTest(unittest.TestCase):
    def setUp(self):
        config_path = Path(__file__).parent / "strategy_validation" / "configs" / "nasdaq_leveraged_risk.json"
        self.config = load_config(config_path)

    def test_report_and_notion_include_all_rolling_win_rate_windows(self):
        columns = display_columns(self.config)
        self.assertEqual(columns["rolling_1y_win_rate"], "滚动1年胜率")
        self.assertEqual(columns["rolling_3y_win_rate"], "滚动3年胜率")
        self.assertEqual(columns["rolling_5y_win_rate"], "滚动5年胜率")

        row = pd.Series(
            {
                "strategy": "Test",
                "cagr_pct": 10.0,
                "max_drawdown_pct": -20.0,
                "sharpe": 1.0,
                "rank": 1,
                "score": 80.0,
                "excess_cagr_pct": 2.0,
                "max_drawdown_ratio_vs_signal": 0.8,
                "rolling_1y_win_rate": 0.61,
                "rolling_3y_win_rate": 0.72,
                "rolling_5y_win_rate": 0.83,
                "dca_vs_signal_pct": 15.0,
                "note": "Test note",
                "switches_per_year": 4.0,
                "risk_flag": "",
            }
        )
        properties = result_row_properties(row, self.config)
        self.assertEqual(properties["滚动1年胜率"]["number"], 61.0)
        self.assertEqual(properties["滚动3年胜率"]["number"], 72.0)
        self.assertEqual(properties["滚动5年胜率"]["number"], 83.0)


if __name__ == "__main__":
    unittest.main()
