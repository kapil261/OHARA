"""OHARA AI/ML Service Configuration and Hyperparameters."""

from typing import Set

# --- Elo Adaptive Difficulty Constants ---
DEFAULT_SKILL: float = 1200.0
ELO_SCALE: float = 400.0
K_FACTOR_CALIBRATION: float = 32.0
K_FACTOR_STABLE: float = 16.0
TARGET_SUCCESS_RATE: float = 0.78

# Dignity-first errorless learning outcome scores
OUTCOME_CLEAN_CORRECT: float = 1.0
OUTCOME_HINTED_CORRECT: float = 0.7  # Hints are never counted as failures
OUTCOME_FAILED: float = 0.0

MIN_LEVEL: int = 1
MAX_LEVEL: int = 10
MAX_LEVEL_DELTA_PER_SESSION: int = 1  # Never jump more than 1 level per session
LEVEL_BASE_RATING: float = 1000.0
LEVEL_STEP_RATING: float = 100.0

# --- Personal Baseline Tracking Constants ---
MIN_BASELINE_DAYS: int = 14
DEFAULT_EWMA_ALPHA: float = 0.08  # Calibrated via synthetic patient simulations (stable vs decline)
EPSILON_STD: float = 1e-4  # Floor to prevent division by zero in zero-variance metrics

# --- Decline Detection Constants ---
PERSISTENCE_THRESHOLD_DAYS: int = 3  # Must persist for at least 3 observations/days
Z_THRESHOLD_MILD: float = 1.5
Z_THRESHOLD_MODERATE: float = 2.0
Z_THRESHOLD_SHARP: float = 2.8

# Inverted metrics where HIGHER values indicate deterioration
INVERTED_METRICS: Set[str] = {
    "responsetimems",
    "response_time_ms",
    "responsetime",
    "reaction_time",
    "hintsused",
    "hints_used",
    "hints",
    "latency",
}
