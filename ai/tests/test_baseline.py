"""Unit tests for personal baseline tracking."""

import pytest
from app.config import MIN_BASELINE_DAYS, EPSILON_STD
from app.schemas import BaselineStats
from app.baseline.baseline import compute_baseline_stats


def test_empty_baseline():
    median, ewma, std, count, status = compute_baseline_stats([])
    assert count == 0
    assert status == "establishing"


def test_initial_14_day_baseline():
    # 14 days of realistic game accuracy data
    daily_values = [0.75, 0.80, 0.78, 0.82, 0.77, 0.79, 0.81, 0.76, 0.80, 0.78, 0.82, 0.85, 0.79, 0.81]
    median, ewma, std, count, status = compute_baseline_stats(daily_values)

    assert count == 14
    assert status == "established"
    assert 0.78 <= median <= 0.81
    assert 0.78 <= ewma <= 0.81
    assert std > 0.0


def test_establishing_status_under_14_days():
    daily_values = [0.80, 0.82, 0.78, 0.85]
    median, ewma, std, count, status = compute_baseline_stats(daily_values)

    assert count == 4
    assert status == "establishing"


def test_ewma_updates_with_existing_baseline():
    existing = BaselineStats(median=0.80, ewma=0.80, std=0.04, count=14)
    # Elder has a slightly lower day: 0.70
    median, ewma, std, count, status = compute_baseline_stats(
        daily_values=[0.70],
        existing_baseline=existing,
        alpha=0.20,
    )

    # EWMA formula: 0.20 * 0.70 + 0.80 * 0.80 = 0.14 + 0.64 = 0.78
    assert count == 15
    assert status == "established"
    assert pytest.approx(ewma, 0.01) == 0.78


def test_zero_variance_handled_with_epsilon():
    # Constant values
    daily_values = [0.80] * 14
    median, ewma, std, count, status = compute_baseline_stats(daily_values)

    assert std == EPSILON_STD  # Avoid zero division
    assert ewma == 0.80
    assert median == 0.80
