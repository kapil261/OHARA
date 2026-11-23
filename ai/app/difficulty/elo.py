"""Elo adaptive difficulty engine with errorless learning support."""

import numpy as np
from typing import List, Tuple
from app.config import (
    DEFAULT_SKILL,
    ELO_SCALE,
    K_FACTOR_CALIBRATION,
    K_FACTOR_STABLE,
    TARGET_SUCCESS_RATE,
    OUTCOME_CLEAN_CORRECT,
    OUTCOME_HINTED_CORRECT,
    OUTCOME_FAILED,
    MIN_LEVEL,
    MAX_LEVEL,
    MAX_LEVEL_DELTA_PER_SESSION,
    LEVEL_BASE_RATING,
    LEVEL_STEP_RATING,
)
from app.schemas import RoundHistoryItem


def difficulty_for_level(level: int) -> float:
    """Calculates the Elo difficulty rating corresponding to a game level."""
    clamped_level = max(MIN_LEVEL, min(MAX_LEVEL, level))
    return LEVEL_BASE_RATING + (clamped_level - 1) * LEVEL_STEP_RATING


def skill_to_level(skill: float) -> int:
    """Converts a continuous skill rating into a discrete game level (1-10)."""
    raw_level = round((skill - LEVEL_BASE_RATING) / LEVEL_STEP_RATING) + 1
    return int(np.clip(raw_level, MIN_LEVEL, MAX_LEVEL))


def expected_success_probability(skill: float, difficulty: float) -> float:
    """Standard Elo logistic function for expected probability of success."""
    exponent = (difficulty - skill) / ELO_SCALE
    # Clip exponent to avoid float overflow
    exponent = float(np.clip(exponent, -10.0, 10.0))
    return float(1.0 / (1.0 + 10.0 ** exponent))


def calculate_round_outcome(round_item: RoundHistoryItem) -> float:
    """
    Computes outcome score honoring dignity and errorless learning:
    - Clean correct on first attempt = 1.0
    - Hint-assisted correct = 0.7 (Never counted as a failure)
    - Abandoned or 0 accuracy = 0.0
    """
    if not round_item.completed:
        return OUTCOME_FAILED

    if round_item.hintsUsed == 0 and round_item.accuracy >= 0.99:
        return OUTCOME_CLEAN_CORRECT

    if round_item.hintsUsed > 0 or round_item.accuracy > 0.0:
        # Partial credit: hints encourage engagement rather than penalizing
        return OUTCOME_HINTED_CORRECT

    return OUTCOME_FAILED


def calculate_next_difficulty(
    current_level: int,
    current_skill: float,
    history: List[RoundHistoryItem],
) -> Tuple[int, float, str]:
    """
    Computes updated skill rating and recommended next game level.
    Guarantees that level changes are capped at +/- 1 step per session.
    """
    if not history:
        return (
            current_level,
            current_skill,
            "No session history provided; keeping current level.",
        )

    # 1. Calculate aggregate outcome across rounds in this session
    outcomes = [calculate_round_outcome(item) for item in history]
    session_outcome = float(np.mean(outcomes))

    # 2. Get current game difficulty rating
    current_diff = difficulty_for_level(current_level)

    # 3. Compute expected probability of success
    expected = expected_success_probability(current_skill, current_diff)

    # 4. Determine K-factor (adaptive calibration vs stable)
    k_factor = K_FACTOR_CALIBRATION if len(history) < 3 else K_FACTOR_STABLE

    # 5. Update skill using Elo formula
    updated_skill = float(current_skill + k_factor * (session_outcome - expected))

    # 6. Determine recommended level based on performance vs target success rate (0.78)
    # If success probability is significantly higher than target and outcome was good -> advance
    # If success probability is too low and elder struggled -> ease down
    candidate_level = current_level

    if expected > (TARGET_SUCCESS_RATE + 0.08) and session_outcome >= OUTCOME_HINTED_CORRECT:
        candidate_level = current_level + 1
        reason = f"Comfortable performance (success {session_outcome:.2f} >= expected {expected:.2f}). Progressing difficulty."
    elif expected < (TARGET_SUCCESS_RATE - 0.12) and session_outcome < OUTCOME_HINTED_CORRECT:
        candidate_level = current_level - 1
        reason = f"Challenging session (success {session_outcome:.2f} < expected {expected:.2f}). Adjusting difficulty for comfort."
    else:
        candidate_level = current_level
        reason = f"Flow state maintained near target success rate ({TARGET_SUCCESS_RATE * 100:.0f}%). Retaining level."

    # 7. Safety clamp: Maximum level change of +/- 1 per session, bounded to [MIN_LEVEL, MAX_LEVEL]
    delta = candidate_level - current_level
    clamped_delta = max(-MAX_LEVEL_DELTA_PER_SESSION, min(MAX_LEVEL_DELTA_PER_SESSION, delta))
    recommended_level = int(np.clip(current_level + clamped_delta, MIN_LEVEL, MAX_LEVEL))

    return recommended_level, round(updated_skill, 2), reason
