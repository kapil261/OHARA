"""Unit tests for the Elo adaptive difficulty engine."""

import pytest
from app.config import (
    DEFAULT_SKILL,
    TARGET_SUCCESS_RATE,
    MIN_LEVEL,
    MAX_LEVEL,
    LEVEL_BASE_RATING,
    LEVEL_STEP_RATING,
    OUTCOME_CLEAN_CORRECT,
    OUTCOME_HINTED_CORRECT,
    OUTCOME_FAILED,
)
from app.schemas import RoundHistoryItem
from app.difficulty.elo import (
    difficulty_for_level,
    skill_to_level,
    expected_success_probability,
    calculate_round_outcome,
    calculate_next_difficulty,
)


def test_difficulty_for_level_mapping():
    assert difficulty_for_level(1) == LEVEL_BASE_RATING
    assert difficulty_for_level(2) == LEVEL_BASE_RATING + LEVEL_STEP_RATING
    assert difficulty_for_level(10) == LEVEL_BASE_RATING + 9 * LEVEL_STEP_RATING
    # Clamping
    assert difficulty_for_level(0) == LEVEL_BASE_RATING
    assert difficulty_for_level(15) == LEVEL_BASE_RATING + 9 * LEVEL_STEP_RATING


def test_skill_to_level_mapping():
    assert skill_to_level(LEVEL_BASE_RATING) == 1
    assert skill_to_level(LEVEL_BASE_RATING + LEVEL_STEP_RATING) == 2
    assert skill_to_level(500.0) == MIN_LEVEL
    assert skill_to_level(3000.0) == MAX_LEVEL


def test_expected_success_probability():
    # Equal skill and difficulty yields 50% probability
    prob_equal = expected_success_probability(1200.0, 1200.0)
    assert pytest.approx(prob_equal, 0.01) == 0.50

    # Significantly higher skill yields higher win probability
    prob_high_skill = expected_success_probability(1600.0, 1200.0)
    assert prob_high_skill > 0.85

    # Lower skill yields lower probability
    prob_low_skill = expected_success_probability(1000.0, 1200.0)
    assert prob_low_skill < 0.30


def test_errorless_learning_round_outcomes():
    # Clean win without hints = 1.0
    clean_round = RoundHistoryItem(level=1, accuracy=1.0, hintsUsed=0, completed=True)
    assert calculate_round_outcome(clean_round) == OUTCOME_CLEAN_CORRECT

    # Hint-assisted win must receive dignity credit (0.7), never 0.0 failure
    hinted_round = RoundHistoryItem(level=1, accuracy=1.0, hintsUsed=2, completed=True)
    assert calculate_round_outcome(hinted_round) == OUTCOME_HINTED_CORRECT

    # Partial accuracy round also gets dignity credit
    partial_round = RoundHistoryItem(level=1, accuracy=0.6, hintsUsed=1, completed=True)
    assert calculate_round_outcome(partial_round) == OUTCOME_HINTED_CORRECT

    # Abandoned or failed session = 0.0
    failed_round = RoundHistoryItem(level=1, accuracy=0.0, hintsUsed=0, completed=False)
    assert calculate_round_outcome(failed_round) == OUTCOME_FAILED


def test_level_clamping_max_one_step_change():
    # Even with consecutive perfect rounds, level can only advance by at most +1
    history = [
        RoundHistoryItem(level=1, accuracy=1.0, hintsUsed=0, completed=True)
        for _ in range(5)
    ]
    rec_level, new_skill, _ = calculate_next_difficulty(
        current_level=1,
        current_skill=1400.0,  # High skill that might otherwise suggest level 4
        history=history,
    )
    assert rec_level <= 2  # At most +1 jump from current_level=1
    assert new_skill > 1400.0


def test_no_history_keeps_current_level():
    rec_level, new_skill, reason = calculate_next_difficulty(
        current_level=3,
        current_skill=1250.0,
        history=[],
    )
    assert rec_level == 3
    assert new_skill == 1250.0
