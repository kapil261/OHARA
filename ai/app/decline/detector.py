"""Cognitive decline detection engine with multi-session persistence filtering."""

import numpy as np
from typing import Dict, List, Optional
from app.config import (
    PERSISTENCE_THRESHOLD_DAYS,
    Z_THRESHOLD_MILD,
    Z_THRESHOLD_MODERATE,
    Z_THRESHOLD_SHARP,
    INVERTED_METRICS,
    EPSILON_STD,
    MIN_BASELINE_SAMPLES,
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
    Implements multi-session persistence checks to eliminate false alarms from transient bad rounds.
    If baseline is missing or has fewer than MIN_BASELINE_SAMPLES (5 sessions), returns decline: false with 'Baseline not ready'.
    """
    if not recent_metrics or not baseline_map:
        return DeclineResponse(
            patientId=patient_id,
            decline=False,
            declined=False,
            score=0.0,
            zScore=0.0,
            metric="none",
            severity="none",
            flagged=False,
            persistenceCount=0,
            notes="Baseline not ready (no baseline history available for patient)",
            reason="Baseline not ready (no baseline history available for patient)",
        )

    # Normalize baseline map keys for case-insensitive lookup
    normalized_baseline: Dict[str, BaselineMetricData] = {
        k.lower().replace("_", "").replace("-", ""): v for k, v in baseline_map.items()
    }

    most_severe_result: Optional[DeclineResponse] = None
    highest_severity_rank = -1
    severity_order = {"none": 0, "mild": 1, "moderate": 2, "sharp": 3}
    evaluated_established_count = 0
    cold_start_count = 0

    for item in recent_metrics:
        metric = item.metric
        values = item.values
        if not values:
            continue

        norm_key = metric.lower().replace("_", "").replace("-", "")
        if norm_key not in normalized_baseline:
            continue

        base_data = normalized_baseline[norm_key]
        sample_count = base_data.get_sample_count()

        # Cold start check: do not flag decline if baseline has fewer than MIN_BASELINE_SAMPLES (5 sessions)
        if sample_count is not None and sample_count < MIN_BASELINE_SAMPLES:
            cold_start_count += 1
            continue

        evaluated_established_count += 1
        std = max(base_data.std, EPSILON_STD)
        ewma = base_data.ewma
        mean_recent = float(np.mean(values))
        inverted = is_metric_inverted(metric)

        # Raw Z-score: positive means above EWMA, negative means below EWMA
        raw_z = (mean_recent - ewma) / std

        # Directional Z: positive directional Z always means deterioration
        directional_z = raw_z if inverted else -raw_z

        # Check persistence across individual recent observations
        persisting_count = 0
        for val in values:
            val_raw_z = (val - ewma) / std
            val_dir_z = val_raw_z if inverted else -val_raw_z
            if val_dir_z >= Z_THRESHOLD_MILD:
                persisting_count += 1

        # Persistence rule: Requires at least PERSISTENCE_THRESHOLD_DAYS (or all recent if >= 2)
        # Single session cannot trigger persistent decline
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
                flagged = False  # Logged for trend monitoring, not an immediate alert

        effective_persistence = persisting_count if is_persistent else 0
        score_val = round(raw_z, 2)
        
        if is_persistent:
            reason_text = (
                f"Metric '{metric}' recent mean is {mean_recent:.3f} vs baseline EWMA {ewma:.3f} "
                f"(z={raw_z:.2f}). Persisted for {persisting_count}/{len(values)} recent observations."
            )
        else:
            reason_text = (
                f"Metric '{metric}' recent mean is {mean_recent:.3f} vs baseline EWMA {ewma:.3f} "
                f"(z={raw_z:.2f}). Did not meet multi-session persistence requirement."
            )

        rank = severity_order[severity]
        if rank > highest_severity_rank:
            highest_severity_rank = rank
            most_severe_result = DeclineResponse(
                patientId=patient_id,
                decline=declined,
                declined=declined,
                score=score_val,
                zScore=score_val,
                metric=metric,
                severity=severity,
                flagged=flagged,
                persistenceCount=effective_persistence,
                reason=reason_text,
                notes=reason_text,
            )

    if most_severe_result is not None:
        return most_severe_result

    fallback_metric = recent_metrics[0].metric if recent_metrics else "none"
    if cold_start_count > 0 and evaluated_established_count == 0:
        default_msg = f"Baseline not ready (needs at least {MIN_BASELINE_SAMPLES} sessions to establish baseline)"
    else:
        default_msg = "Metrics are within normal personal variation ranges."

    return DeclineResponse(
        patientId=patient_id,
        decline=False,
        declined=False,
        score=0.0,
        zScore=0.0,
        metric=fallback_metric,
        severity="none",
        flagged=False,
        persistenceCount=0,
        reason=default_msg,
        notes=default_msg,
    )
