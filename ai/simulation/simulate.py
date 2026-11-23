"""
Synthetic Patient Simulation and Threshold Tuning Suite.

Generates cohorts of synthetic elders to tune and validate:
1. False Positive Rate on stable elders (must be < 5%).
2. Sensitivity / Recall on progressive decline (must be > 90%).
3. Detection Latency on acute / sharp decline (must be <= 3 days).
"""

import numpy as np
from typing import Dict, List, Tuple
from app.config import MIN_BASELINE_DAYS
from app.schemas import BaselineMetricData, RecentMetric
from app.baseline.baseline import compute_baseline_stats
from app.decline.detector import evaluate_decline


def generate_stable_patient(days: int = 60, seed: int = 42) -> np.ndarray:
    """Generates a stable elder with daily noise and an occasional isolated off-day."""
    rng = np.random.default_rng(seed)
    base = 0.80
    noise = rng.normal(0.0, 0.04, size=days)
    values = np.clip(base + noise, 0.0, 1.0)
    # Inject 2 isolated bad days that should NOT trigger persistent decline alerts
    if days > 25:
        values[22] = 0.45
    if days > 45:
        values[42] = 0.50
    return values


def generate_slow_decline_patient(days: int = 60, onset_day: int = 20, seed: int = 42) -> np.ndarray:
    """Generates an elder with gradual cognitive decline (e.g., mild cognitive impairment progression)."""
    rng = np.random.default_rng(seed)
    values = np.zeros(days)
    base = 0.80

    for d in range(days):
        if d < onset_day:
            val = base + rng.normal(0.0, 0.04)
        else:
            # Linear decay from 0.80 to ~0.45 over 40 days
            decay = 0.35 * ((d - onset_day) / (days - onset_day))
            val = (base - decay) + rng.normal(0.0, 0.04)
        values[d] = np.clip(val, 0.0, 1.0)
    return values


def generate_sharp_decline_patient(days: int = 60, drop_day: int = 30, seed: int = 42) -> np.ndarray:
    """Generates an elder with acute cognitive drop (e.g. delirium, stroke, or severe illness)."""
    rng = np.random.default_rng(seed)
    values = np.zeros(days)
    base = 0.80

    for d in range(days):
        if d < drop_day:
            val = base + rng.normal(0.0, 0.04)
        else:
            # Abrupt drop from 0.80 to 0.40
            val = 0.40 + rng.normal(0.0, 0.05)
        values[d] = np.clip(val, 0.0, 1.0)
    return values


def run_patient_simulation(
    trajectory: np.ndarray,
    patient_id: str,
    onset_day: int = -1,
) -> Dict[str, any]:
    """Runs a simulated patient through baseline initialization and daily decline detection."""
    days = len(trajectory)
    # 1. Establish initial 14-day baseline
    initial_14 = trajectory[:MIN_BASELINE_DAYS].tolist()
    median, ewma, std, count, status = compute_baseline_stats(initial_14)

    baseline_data = BaselineMetricData(
        median=median,
        ewma=ewma,
        std=std,
        count=count,
    )

    detected = False
    first_detection_day = -1
    alerts_triggered = 0

    # 2. Iterate through subsequent days
    for day in range(MIN_BASELINE_DAYS, days):
        # Rolling window of last 3 days
        window_start = max(0, day - 2)
        recent_window = trajectory[window_start : day + 1].tolist()

        res = evaluate_decline(
            patient_id=patient_id,
            recent_metrics=[RecentMetric(metric="accuracy", values=recent_window)],
            baseline_map={"accuracy": baseline_data},
        )

        if res.declined:
            alerts_triggered += 1
            if not detected:
                detected = True
                first_detection_day = day

        # Update baseline with current day observation
        _, new_ewma, _, new_count, _ = compute_baseline_stats(
            daily_values=[float(trajectory[day])],
            existing_baseline=baseline_data,
        )
        baseline_data.ewma = new_ewma
        baseline_data.count = new_count

    detection_delay = -1
    if detected and onset_day >= 0:
        detection_delay = max(0, first_detection_day - onset_day)

    return {
        "patientId": patient_id,
        "detected": detected,
        "firstDetectionDay": first_detection_day,
        "detectionDelay": detection_delay,
        "totalAlerts": alerts_triggered,
    }


def run_benchmark(n_stable: int = 50, n_slow: int = 30, n_sharp: int = 20) -> Dict[str, float]:
    """Executes full cohort benchmark and computes safety and sensitivity metrics."""
    print("=" * 60)
    print("OHARA AI Service - Synthetic Cohort Simulation & Benchmark")
    print("=" * 60)

    # 1. Stable Cohort
    false_alarms = 0
    for i in range(n_stable):
        traj = generate_stable_patient(days=60, seed=100 + i)
        sim = run_patient_simulation(traj, f"stable-{i}")
        if sim["detected"]:
            false_alarms += 1
    fpr = (false_alarms / n_stable) * 100.0

    # 2. Slow Decline Cohort (Onset at day 20)
    slow_detected = 0
    slow_delays: List[int] = []
    for i in range(n_slow):
        traj = generate_slow_decline_patient(days=60, onset_day=20, seed=200 + i)
        sim = run_patient_simulation(traj, f"slow-{i}", onset_day=20)
        if sim["detected"]:
            slow_detected += 1
            slow_delays.append(sim["detectionDelay"])
    slow_sensitivity = (slow_detected / n_slow) * 100.0
    slow_mean_delay = float(np.mean(slow_delays)) if slow_delays else 0.0

    # 3. Sharp Decline Cohort (Abrupt drop at day 30)
    sharp_detected = 0
    sharp_delays: List[int] = []
    for i in range(n_sharp):
        traj = generate_sharp_decline_patient(days=60, drop_day=30, seed=300 + i)
        sim = run_patient_simulation(traj, f"sharp-{i}", onset_day=30)
        if sim["detected"]:
            sharp_detected += 1
            sharp_delays.append(sim["detectionDelay"])
    sharp_sensitivity = (sharp_detected / n_sharp) * 100.0
    sharp_mean_delay = float(np.mean(sharp_delays)) if sharp_delays else 0.0

    print(f"Cohort Sizes: {n_stable} Stable | {n_slow} Slow Decline | {n_sharp} Sharp Decline")
    print("-" * 60)
    print(f"Stable Cohort False Alarm Rate: {fpr:.1f}% (Target: < 5.0%)")
    print(f"Slow Decline Sensitivity:       {slow_sensitivity:.1f}% (Target: > 90.0%)")
    print(f"Slow Decline Mean Lag:          {slow_mean_delay:.1f} days")
    print(f"Sharp Decline Sensitivity:      {sharp_sensitivity:.1f}% (Target: 100.0%)")
    print(f"Sharp Decline Mean Lag:         {sharp_mean_delay:.1f} days (Target: <= 3.0 days)")
    print("=" * 60)

    return {
        "falsePositiveRate": fpr,
        "slowSensitivity": slow_sensitivity,
        "slowMeanDelayDays": slow_mean_delay,
        "sharpSensitivity": sharp_sensitivity,
        "sharpMeanDelayDays": sharp_mean_delay,
    }


if __name__ == "__main__":
    run_benchmark()
