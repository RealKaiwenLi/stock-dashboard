import unittest
import json
from pathlib import Path
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


class PostExitReentryTest(unittest.TestCase):
    def setUp(self):
        dates = pd.date_range("2024-01-02", periods=8, freq="B")
        self.frame = pd.DataFrame({
            "date": dates,
            "QQQ_open": [100] * 8, "QQQ_close": [100, 101, 99, 101, 99, 101, 102, 103],
            "RISK_open": [100] * 8, "RISK_close": [100, 102, 98, 103, 97, 104, 105, 106],
        })
        self.diagnostics = {"conditions": [], "logic": "AND", "primaryPassed": False, "requirePositiveHist": False, "histPositive": False, "primaryLabel": "Exit signal"}

    def test_shared_fixture_is_versioned_and_has_boundary_cases(self):
        payload = json.loads((Path(__file__).parent / "fixtures/post_exit_reentry_cases.json").read_text())
        self.assertEqual(payload["schemaVersion"], 1)
        self.assertGreaterEqual(len(payload["cases"]), 6)

    def test_every_shared_fixture_case_matches_flask_production_state_machine(self):
        fixture = json.loads((Path(__file__).parent / "fixtures/post_exit_reentry_cases.json").read_text())
        for case in fixture["cases"]:
            with self.subTest(case=case["name"]):
                frame = pd.DataFrame(fixture["rows"][:case["rowCount"]])
                frame["date"] = pd.to_datetime(frame["date"])
                config = json.loads(json.dumps(fixture["strategy"]))
                if case["policy"] is not None:
                    config["postExitReentry"] = case["policy"]
                overrides = {"entry": case["entrySignals"], "exit": case["exitSignals"]}
                result = app.run_strategy(frame, config, 0, {"cagrPct": 0}, overrides)
                projected_trades = [{key: trade.get(key) for key in ("signalDate", "releaseDate", "executionDate", "from", "to")} for trade in result["trades"]]
                projected_events = [{key: event.get(key) for key in ("eventDate", "eventType")} for event in result["events"]]
                self.assertEqual(projected_trades, case["expected"]["trades"])
                self.assertEqual(projected_events, case["expected"]["events"])
                self.assertEqual([point["value"] for point in result["equityCurve"]], case["expected"]["equity"])
                self.assertEqual({key: result["summary"][key] for key in case["expected"]["counts"]}, case["expected"]["counts"])
                runtime = result["latestSignal"]["postExitReentry"]
                actual_latest = {
                    "enabled": runtime["enabled"],
                    "state": runtime["state"],
                    "actualHolding": result["latestSignal"]["actualHolding"],
                    "nextTarget": result["latestSignal"]["nextTarget"],
                    "releaseValidationPassed": runtime["releaseValidation"]["passed"] if runtime["releaseValidation"] else None,
                    "hasPendingOrder": runtime["pendingOrder"] is not None,
                }
                if "releaseConditionCount" in case["expected"]["latest"]:
                    actual_latest["releaseConditionCount"] = len(runtime["releaseValidation"]["conditions"])
                if "earliestReleaseOutOfRange" in case["expected"]["latest"]:
                    actual_latest["earliestReleaseOutOfRange"] = runtime["earliestReleaseOutOfRange"]
                    actual_latest["deferredValidThroughOutOfRange"] = runtime["deferredSignal"]["validThroughOutOfRange"]
                self.assertEqual(actual_latest, case["expected"]["latest"])
                if "dualSourceSignalDates" in case["expected"]:
                    scheduled = next(event for event in result["events"] if event["eventType"] == "Order Scheduled" and event.get("releaseDate"))
                    self.assertEqual(scheduled["sourceSignalDates"], case["expected"]["dualSourceSignalDates"])
                if "releaseSnapshot" in case["expected"]:
                    release_event = next(event for event in result["events"] if event["eventType"] in {"Release Passed", "Release Rejected"})
                    self.assertEqual(release_event["ruleSnapshot"], case["expected"]["releaseSnapshot"])

    def test_shared_invalid_cases_return_the_expected_path(self):
        fixture = json.loads((Path(__file__).parent / "fixtures/post_exit_reentry_cases.json").read_text())
        for case in fixture["invalidCases"]:
            with self.subTest(case=case["name"]):
                config = json.loads(json.dumps(fixture["strategy"]))
                config["postExitReentry"] = case["policy"]
                with self.assertRaises(app.StrategyConfigError) as raised:
                    app.normalize_post_exit_reentry(config)
                self.assertEqual(raised.exception.path, case["path"])

    def test_all_current_state_rules_are_no_lookahead(self):
        dates = pd.date_range("2024-01-02", periods=20, freq="B")
        frame = pd.DataFrame({
            "date": dates,
            "SIG_open": [100 + index for index in range(20)],
            "SIG_close": [100 + index + (index % 3) for index in range(20)],
            "RISK_open": [100] * 20,
            "RISK_close": [100] * 20,
        })
        config = {"signalAsset": "SIG", "riskAsset": "RISK", "fallbackAsset": "CASH"}
        rules = [
            {"assetRole": "signal", "type": kind, "fast": 2, "slow": 3, "signal": 2}
            for kind in ("macd_above_signal", "macd_below_signal", "hist_positive", "hist_negative")
        ] + [
            {"assetRole": "signal", "type": kind, "maType": "ema", "window": 3}
            for kind in ("close_above_ma", "close_below_ma")
        ] + [
            {"assetRole": "signal", "type": kind, "window": 3}
            for kind in ("close_above_prior_high", "close_below_prior_low")
        ]
        for rule in rules:
            with self.subTest(rule=rule["type"]):
                before = app.evaluate_state_rule(frame, config, rule, 10)
                changed = frame.copy()
                changed.loc[11:, ["SIG_open", "SIG_close"]] = 1000000
                after = app.evaluate_state_rule(changed, config, rule, 10)
                self.assertEqual(before, after)

    def test_disabled_invalid_draft_is_ignored(self):
        config = strategy(False)
        config.update({"riskAsset": "RISK", "postExitReentry": {"enabled": False, "cooldownTradingDays": "bad"}})
        entry = pd.Series([False, True, False, False, False, False, False, False])
        exit_ = pd.Series([False, False, True, False, False, False, False, False])
        with patch.object(app, "build_entry_signal", return_value=entry), patch.object(app, "build_exit_signal", return_value=(exit_, self.diagnostics)):
            result = app.run_strategy(self.frame, config, 0, {"cagrPct": 0})
        self.assertFalse(result["latestSignal"]["postExitReentry"]["enabled"])
        self.assertFalse(any(event["eventType"] in {"Cooldown Started", "Entry Ignored", "Signal Retained"} for event in result["events"]))

    def test_cooldown_retains_and_releases_on_aligned_trading_days(self):
        config = strategy(False)
        config.update({
            "riskAsset": "RISK",
            "postExitReentry": {
                "enabled": True, "cooldownTradingDays": 2, "signalHandling": "retain_latest", "retentionTradingDays": 3,
                "releaseValidation": {"mode": "signal_still_valid"},
            },
        })
        entry = pd.Series([False, True, False, True, False, False, False, False])
        exit_ = pd.Series([False, False, True, False, False, False, False, False])
        with patch.object(app, "build_entry_signal", return_value=entry), patch.object(app, "build_exit_signal", return_value=(exit_, self.diagnostics)):
            result = app.run_strategy(self.frame, config, 0, {"cagrPct": 0})
        types = [event["eventType"] for event in result["events"]]
        self.assertIn("Cooldown Started", types)
        self.assertIn("Signal Retained", types)
        self.assertIn("Release Passed", types)
        released = next(trade for trade in result["trades"] if trade.get("deferred"))
        self.assertIsNotNone(released["releaseDate"])
        self.assertGreater(released["executionDate"], released["releaseDate"])

    def test_active_invalid_parameter_has_path(self):
        with self.assertRaises(app.StrategyConfigError) as raised:
            app.normalize_post_exit_reentry({"postExitReentry": {"enabled": True, "cooldownTradingDays": 0, "signalHandling": "ignore"}})
        self.assertEqual(raised.exception.path, "postExitReentry.cooldownTradingDays")


if __name__ == "__main__":
    unittest.main()
