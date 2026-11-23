"""FastAPI application for the OHARA AI/ML Microservice."""

import logging
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.config import (
    DEFAULT_SKILL,
    TARGET_SUCCESS_RATE,
    MIN_LEVEL,
)
from app.schemas import (
    HealthResponse,
    DifficultyRequest,
    DifficultyResponse,
    BaselineRequest,
    BaselineResponse,
    DeclineRequest,
    DeclineResponse,
)
from app.difficulty.elo import calculate_next_difficulty, difficulty_for_level
from app.baseline.baseline import compute_baseline_stats
from app.decline.detector import evaluate_decline

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ohara-ai")

app = FastAPI(
    title="OHARA AI / ML Service",
    description="Adaptive game difficulty and personal baseline decline detection for dementia care.",
    version="1.0.0",
)

# Enable CORS for local cross-service communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check() -> HealthResponse:
    """Service health probe."""
    return HealthResponse(status="ok", service="ohara-ai", version="1.0.0")


@app.post("/difficulty", response_model=DifficultyResponse, tags=["Cognitive Games"])
def adaptive_difficulty(req: DifficultyRequest) -> DifficultyResponse:
    """
    Computes adaptive Elo difficulty for the patient's next game round:
    - Maintains target success rate (~78%)
    - Credits errorless learning hints as partial successes
    - Clamps level change to at most +/- 1 per session
    """
    try:
        curr_level = req.currentLevel if req.currentLevel is not None else MIN_LEVEL
        curr_skill = req.currentSkill if req.currentSkill is not None else difficulty_for_level(curr_level)

        rec_level, new_skill, reason = calculate_next_difficulty(
            current_level=curr_level,
            current_skill=curr_skill,
            history=req.history,
        )

        return DifficultyResponse(
            patientId=req.patientId,
            game=req.game,
            level=rec_level,
            skill=new_skill,
            targetSuccess=TARGET_SUCCESS_RATE,
            reason=reason,
        )
    except Exception as e:
        logger.error(f"Error computing difficulty for patient {req.patientId}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.post("/baseline", response_model=BaselineResponse, tags=["Analytics"])
def personal_baseline(req: BaselineRequest) -> BaselineResponse:
    """
    Computes or updates personal baseline:
    - Days 1-14: Bootstraps robust median and sample standard deviation
    - Subsequent days: Updates Exponentially Weighted Moving Average (EWMA)
    """
    try:
        metric_name = req.metric or "accuracy"
        values = req.dailyValues or []

        # If values were passed inside metrics array instead:
        if not values and req.metrics:
            for item in req.metrics:
                if item.metric == metric_name or not req.metric:
                    metric_name = item.metric
                    values = item.values
                    break

        median, ewma, std, count, status_label = compute_baseline_stats(
            daily_values=values,
            existing_baseline=req.existingBaseline,
        )

        return BaselineResponse(
            patientId=req.patientId,
            metric=metric_name,
            status=status_label,
            daysCounted=count,
            median=median,
            ewma=ewma,
            std=std,
        )
    except Exception as e:
        logger.error(f"Error calculating baseline for patient {req.patientId}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.post("/decline", response_model=DeclineResponse, tags=["Early Detection"])
def decline_detection(req: DeclineRequest) -> DeclineResponse:
    """
    Evaluates recent performance against baseline using z-scores and persistence:
    - Compares elder strictly against their own baseline (never population norms)
    - Requires multi-day persistence to eliminate false alarms from transient bad days
    - Flags mild, moderate, or sharp decline severity
    """
    try:
        return evaluate_decline(
            patient_id=req.patientId,
            recent_metrics=req.recent,
            baseline_map=req.baseline,
        )
    except Exception as e:
        logger.error(f"Error detecting decline for patient {req.patientId}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
