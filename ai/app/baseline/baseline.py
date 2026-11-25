"""Personal baseline tracker using median bootstrap and EWMA."""

import numpy as np
from typing import List, Optional, Tuple
from app.config import (
    MIN_BASELINE_SAMPLES,
    DEFAULT_EWMA_ALPHA,
    EPSILON_STD,
)
from app.schemas import BaselineStats


def compute_baseline_stats(
    daily_values: List[float],
    existing_baseline: Optional[BaselineStats] = None,
    alpha: float = DEFAULT_EWMA_ALPHA,
) -> Tuple[float, float, float, int, str]:
    """
    Computes personal baseline statistics:
    - First MIN_BASELINE_SAMPLES sessions (5): Median-based robust bootstrap + sample standard deviation.
    - Subsequent sessions: Exponentially Weighted Moving Average (EWMA) updates.
    
    Returns: (median, ewma, std, count, status)
    """
    if not daily_values:
        if existing_baseline:
            return (
                existing_baseline.median,
                existing_baseline.ewma,
                existing_baseline.std,
                existing_baseline.count or 0,
                "established" if (existing_baseline.count or 0) >= MIN_BASELINE_SAMPLES else "establishing",
            )
        return 0.0, 0.0, EPSILON_STD, 0, "establishing"

    count = len(daily_values)
    median_val = float(np.median(daily_values))
    std_val = float(np.std(daily_values, ddof=1 if count > 1 else 0))
    if std_val < EPSILON_STD:
        std_val = EPSILON_STD

    if existing_baseline and existing_baseline.ewma is not None:
        # Progressively update EWMA from existing baseline
        current_ewma = existing_baseline.ewma
        for v in daily_values:
            current_ewma = alpha * float(v) + (1.0 - alpha) * current_ewma
        ewma_val = float(current_ewma)
        total_count = (existing_baseline.count or 0) + count
    else:
        # Cold start: initial EWMA starts from initial median
        total_count = count
        if count <= MIN_BASELINE_SAMPLES:
            ewma_val = median_val
        else:
            # First MIN_BASELINE_SAMPLES sessions anchor the median, subsequent sessions update EWMA
            initial_median = float(np.median(daily_values[:MIN_BASELINE_SAMPLES]))
            ewma_val = initial_median
            for v in daily_values[MIN_BASELINE_SAMPLES:]:
                ewma_val = alpha * float(v) + (1.0 - alpha) * ewma_val

    status = "established" if total_count >= MIN_BASELINE_SAMPLES else "establishing"
    return round(median_val, 4), round(ewma_val, 4), round(std_val, 4), total_count, status
