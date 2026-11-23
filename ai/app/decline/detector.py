"""Cognitive decline detection engine with multi-day persistence filtering."""

import numpy as np
from typing import Dict, List, Optional
from app.config import (
    PERSISTENCE_THRESHOLD_DAYS,
    Z_THRESHOLD_MILD,
    Z_THRESHOLD_MODERATE,
    Z_THRESHOLD_SHARP,
    INVERTED_METRICS,
    EPSILON_STD,
    MIN_BASELINE_DAYS,
)
from app.schemas import (
    RecentMetric,
    BaselineMetricData,
    DeclineResponse,
)


def is_metric_inverted(metric_name: str) -> bool:
    """Returns True if higher values for this metric denote deterioration."""
    cleaned = metric_name.lower().replace("_", "").replace("-", "")
    return cleaned in INVERTED_METRICS


def evaluate_decline(
    patient_id: str,
    recent_metrics: List[RecentMetric],
    baseline_map: Dict[str, BaselineMetricData],
) -> DeclineResponse:
    """
    Evaluates recent patient performance against personal baseline using z-scores.
    Implements multi-day persistence checks to eliminate false alarms from transient bad days.
    """
    if not recent_metrics or not baseline_map:
        return DeclineResponse(
            patientId=patient_id,
            declined=False,
            zScore=0.0,
            metric="none",
            severity="none",
            flagged=False,
            persistenceCount=0,
            notes="Insufficient recent or baseline data for decline analysis.",
        )

    most_severe_result: Optional[DeclineResponse] = None
    highest_severity_rank = -1
    severity_order = {"none": 0, "mild": 1, "moderate": 2, "sharp": 3}

    for item in recent_metrics:
        metric = item.metric
        values = item.values
        if not values or metric not in baseline_map:
            continue

        base_data = baseline_map[metric]

        # Cold start check: do not flag decline if baseline has fewer than 14 days
        if base_data.count is not None and base_data.count < MIN_BASELINE_DAYS:
            continue

        std = max(base_data.std, EPSILON_STD)
        ewma = base_data.ewma
        mean_recent = float(np.mean(values))
        inverted = is_metric_inverted(metric)

        # Raw Z-score: positive means above EWMA, negative means below EWMA
        raw_z = (mean_recent - ewma) / std

        # Directional Z: positive directional Z always means deterioration
        directional_z = raw_z if inverted else -raw_z

        # Check persistence across individual recent observations
        # An observation is deviating if its individual Z meets or exceeds the mild threshold
        persisting_count = 0
        for val in values:
            val_raw_z = (val - ewma) / std
            val_dir_z = val_raw_z if inverted else -val_raw_z
            if val_dir_z >= Z_THRESHOLD_MILD:
                persisting_count += 1

        # Persistence rule: Requires at least PERSISTENCE_THRESHOLD_DAYS (or all recent if >= 2)
        required_persistence = min(PERSISTENCE_THRESHOLD_DAYS, len(values))
        is_persistent = (persisting_count >= required_persistence) and (len(values) >= 2)

        # Determine severity
        severity = "none"
        declined = False
        flagged = False

        if is_persistent:
            if directional_z >= Z_THRESHOLD_SHARP:
                severity = "sharp"
                declined = True
                flagged = True
            elif directional_z >= Z_THRESHOLD_MODERATE:
                severity = "moderate"
                declined = True
                flagged = True
            elif directional_z >= Z_THRESHOLD_MILD:
                severity = "mild"
                declined = True
                flagged = False  # Logged for trend monitoring, not an immediate alarm

        notes = (
            f"Metric '{metric}' recent mean is {mean_recent:.3f} vs baseline EWMA {ewma:.3f} "
            f"(z={raw_z:.2f}). Persisted for {persisting_count}/{len(values)} recent observations."
        )

        rank = severity_order[severity]
        if rank > highest_severity_rank:
            highest_severity_rank = rank
            most_severe_result = DeclineResponse(
                patientId=patient_id,
                declined=declined,
                zScore=round(raw_z, 2),
                metric=metric,
                severity=severity,
                flagged=flagged,
                persistenceCount=persisting_count,
                notes=notes,
            )

    if most_severe_result is not None:
        return most_severe_result

    return DeclineResponse(
        patientId=patient_id,
        declined=False,
        zScore=0.0,
        metric=recent_metrics[0].metric if recent_metrics else "none",
        severity="none",
        flagged=False,
        persistenceCount=0,
        notes="Metrics are within normal personal variation ranges.",
    )
