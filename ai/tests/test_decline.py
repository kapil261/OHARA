"""Unit tests for cognitive decline detection."""

import pytest
from app.schemas import RecentMetric, BaselineMetricData
from app.decline.detector import evaluate_decline, is_metric_inverted


def test_inverted_metrics_detection():
    assert is_metric_inverted("responseTimeMs") is True
    assert is_metric_inverted("response_time_ms") is True
    assert is_metric_inverted("hintsUsed") is True
    assert is_metric_inverted("accuracy") is False
    assert is_metric_inverted("adherence") is False


def test_stable_patient_no_decline():
    baseline = {
        "accuracy": BaselineMetricData(median=0.80, ewma=0.80, std=0.05, count=14)
    }
    recent = [
        RecentMetric(metric="accuracy", values=[0.81, 0.79, 0.80])
    ]
    res = evaluate_decline("p1", recent, baseline)
    assert res.declined is False
    assert res.severity == "none"
    assert res.flagged is False


def test_single_bad_day_ignored_by_persistence_filter():
    baseline = {
        "accuracy": BaselineMetricData(median=0.80, ewma=0.80, std=0.05, count=14)
    }
    # Elder had one bad day (0.50), but two normal days (0.79, 0.80)
    recent = [
        RecentMetric(metric="accuracy", values=[0.80, 0.79, 0.50])
    ]
    res = evaluate_decline("p1", recent, baseline)
    # Must NOT trigger persistent decline alert on a single isolated bad day
    assert res.declined is False
    assert res.severity == "none"


def test_persistent_accuracy_decline_detected():
    baseline = {
        "accuracy": BaselineMetricData(median=0.80, ewma=0.78, std=0.06, count=14)
    }
    # 3 consecutive days of severe accuracy drop
    recent = [
        RecentMetric(metric="accuracy", values=[0.50, 0.45, 0.40])
    ]
    res = evaluate_decline("p1", recent, baseline)

    assert res.declined is True
    assert res.metric == "accuracy"
    assert res.severity in ["moderate", "sharp"]
    assert res.zScore < -4.0
    assert res.persistenceCount == 3


def test_inverted_metric_latency_decline():
    baseline = {
        "responseTimeMs": BaselineMetricData(median=1800.0, ewma=1800.0, std=200.0, count=14)
    }
    # Much slower response times (longer latency) over 3 consecutive sessions
    recent = [
        RecentMetric(metric="responseTimeMs", values=[2600.0, 2700.0, 2800.0])
    ]
    res = evaluate_decline("p1", recent, baseline)

    assert res.declined is True
    assert res.metric == "responseTimeMs"
    assert res.severity in ["moderate", "sharp"]
    assert res.zScore > 3.0


def test_cold_start_suppression():
    # Baseline with only 3 sessions (under 5-session requirement)
    baseline = {
        "accuracy": BaselineMetricData(median=0.80, ewma=0.80, std=0.05, count=3)
    }
    recent = [
        RecentMetric(metric="accuracy", values=[0.40, 0.40, 0.40])
    ]
    res = evaluate_decline("p1", recent, baseline)
    # Decline must be suppressed during cold start baseline calibration
    assert res.declined is False
    assert res.severity == "none"
    assert "Baseline not ready" in res.reason


def test_missing_baseline_returns_baseline_not_ready():
    # Patient has no baseline yet
    res = evaluate_decline("p1", [RecentMetric(metric="accuracy", values=[0.40, 0.40, 0.40])], {})
    assert res.declined is False
    assert res.decline is False
    assert res.severity == "none"
    assert "Baseline not ready" in res.reason


def test_empty_input_handling():
    """Empty recent metrics or baseline map handled gracefully."""
    res1 = evaluate_decline("p1", [], {})
    assert res1.declined is False
    assert res1.persistenceCount == 0

    baseline = {"accuracy": BaselineMetricData(median=0.80, ewma=0.80, std=0.05, count=14)}
    res2 = evaluate_decline("p1", [RecentMetric(metric="accuracy", values=[])], baseline)
    assert res2.declined is False
    assert res2.persistenceCount == 0


def test_single_session_input():
    """A single session should never trigger persistent decline."""
    baseline = {"accuracy": BaselineMetricData(median=0.80, ewma=0.80, std=0.05, count=14)}
    res = evaluate_decline("p1", [RecentMetric(metric="accuracy", values=[0.30])], baseline)
    assert res.declined is False
    assert res.persistenceCount == 0


def test_extreme_response_time():
    """Very large response times (e.g. 600,000 ms) calculate correctly without overflow."""
    baseline = {"responseTimeMs": BaselineMetricData(median=1800.0, ewma=1800.0, std=200.0, count=14)}
    res = evaluate_decline(
        "p1",
        [RecentMetric(metric="responseTimeMs", values=[600000.0, 600000.0, 600000.0])],
        baseline,
    )
    assert res.declined is True
    assert res.severity == "sharp"
    assert res.zScore == 2991.0
