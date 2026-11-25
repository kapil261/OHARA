"""FastAPI application for the OHARA AI/ML Microservice."""

import os
import logging
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException, status, Security, Depends
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware

from app.config import (
    DEFAULT_SKILL,
    TARGET_SUCCESS_RATE,
    MIN_LEVEL,
    ML_API_KEY,
    BACKEND_ORIGIN,
    SERVICE_VERSION,
    DEFAULT_EWMA_ALPHA,
    MIN_BASELINE_SAMPLES,
    MIN_BASELINE_DAYS,
    IS_PROD,
)
from app.schemas import (
    HealthResponse,
    VersionResponse,
    DifficultyRequest,
    DifficultyResponse,
    BaselineRequest,
    BaselineResponse,
    DeclineRequest,
    DeclineResponse,
    RoundHistoryItem,
    RecentMetric,
)
from app.difficulty.elo import calculate_next_difficulty, difficulty_for_level
from app.baseline.baseline import compute_baseline_stats
from app.decline.detector import evaluate_decline

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ohara-ai")

# Lock down CORS: Allow ONLY BACKEND_ORIGIN in production. In dev, allow localhost.
if IS_PROD:
    if not BACKEND_ORIGIN:
        logger.warning("BACKEND_ORIGIN is not configured in production; CORS origins will be empty.")
        allowed_origins = []
    else:
        allowed_origins = [origin.strip() for origin in BACKEND_ORIGIN.split(",") if origin.strip()]
else:
    dev_origins = {
        BACKEND_ORIGIN or "http://localhost:4000",
        "http://localhost:4000",
        "http://127.0.0.1:4000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    }
    allowed_origins = [o for o in dev_origins if o]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Enforces production configuration and logs active models at startup."""
    # Production guard: Refuse to start if ML_API_KEY is missing in production
    if IS_PROD and not os.getenv("ML_API_KEY"):
        logger.critical("FATAL: ML_API_KEY environment variable is required in production! Service refusing to start.")
        raise RuntimeError("ML_API_KEY environment variable must be set in production.")

    logger.info("=" * 60)
    logger.info("OHARA AI / ML Microservice Started (v%s)", SERVICE_VERSION)
    logger.info(
        "Environment: %s | Hyperparameters: TARGET_SUCCESS_RATE=%.2f | EWMA_ALPHA=%.2f | MIN_BASELINE_SAMPLES=%d",
        "PRODUCTION" if IS_PROD else "DEVELOPMENT",
        TARGET_SUCCESS_RATE,
        DEFAULT_EWMA_ALPHA,
        MIN_BASELINE_SAMPLES,
    )
    logger.info("CORS Policy: Restricted to %s", allowed_origins)
    logger.info("Authentication: X-ML-Key header enforced on computational endpoints")
    logger.info(
        "Active Engines: Elo Adaptive Difficulty (dignity credit 0.7) | "
        "14-Day Median+EWMA Baseline | Personal Z-score Decline Detector"
    )
    logger.info("=" * 60)
    yield


app = FastAPI(
    title="OHARA AI / ML Service",
    description="Adaptive game difficulty and personal baseline decline detection for dementia care.",
    version=SERVICE_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# API Key Header Authentication
api_key_header = APIKeyHeader(name="X-ML-Key", auto_error=False)


def verify_ml_key(api_key: Optional[str] = Security(api_key_header)) -> str:
    """Verifies that requests to ML endpoints supply the correct X-ML-Key."""
    expected = os.getenv("ML_API_KEY", ML_API_KEY)
    if not expected or not api_key or api_key != expected:
        logger.warning("Rejected unauthorized ML request with invalid or missing X-ML-Key header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Missing or invalid X-ML-Key header",
        )
    return api_key


@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check() -> HealthResponse:
    """Service health probe (public for orchestrator health checks)."""
    return HealthResponse(status="ok", service="ohara-ai", version=SERVICE_VERSION)


@app.get("/version", response_model=VersionResponse, tags=["System"])
def version_info() -> VersionResponse:
    """Service version and active model metadata (public)."""
    return VersionResponse(
        service="ohara-ai",
        version=SERVICE_VERSION,
        targetSuccessRate=TARGET_SUCCESS_RATE,
        models={
            "difficulty": "Elo Rating (errorless learning dignity credit 0.7, step clamp +/-1)",
            "baseline": f"{MIN_BASELINE_SAMPLES}-session Median Bootstrap + EWMA (alpha={DEFAULT_EWMA_ALPHA})",
            "decline": "Z-score Multi-day Persistence Filter (>=3 days, elder self-baseline)",
        },
    )


@app.post("/difficulty", response_model=DifficultyResponse, dependencies=[Depends(verify_ml_key)], tags=["Cognitive Games"])
def adaptive_difficulty(req: DifficultyRequest) -> DifficultyResponse:
    """
    Computes adaptive Elo difficulty for the patient's next game round:
    - Maintains target success rate (~78%)
    - Credits errorless learning hints as partial successes
    - Clamps level change to at most +/- 1 per session
    - Compatible with both rich history and backend mlClient flat payloads
    """
    try:
        game_name = req.game or req.gameId or "memory-match"
        curr_level = req.currentLevel if req.currentLevel is not None else (req.level if req.level is not None else MIN_LEVEL)
        curr_skill = req.currentSkill if req.currentSkill is not None else difficulty_for_level(curr_level)

        history = req.history
        # If backend passed flat session stats instead of history array:
        if not history and req.accuracy is not None:
            history = [
                RoundHistoryItem(
                    level=curr_level,
                    accuracy=req.accuracy,
                    hintsUsed=req.hintsUsed or 0,
                    responseTimeMs=req.responseTimeMs,
                    completed=True,
                )
            ]

        rec_level, new_skill, reason = calculate_next_difficulty(
            current_level=curr_level,
            current_skill=curr_skill,
            history=history,
        )

        return DifficultyResponse(
            patientId=req.patientId,
            game=game_name,
            gameId=req.gameId or game_name,
            level=rec_level,
            skill=new_skill,
            targetSuccess=TARGET_SUCCESS_RATE,
            targetSuccessRate=TARGET_SUCCESS_RATE,
            reason=reason,
        )
    except Exception as e:
        logger.error(f"Error computing difficulty for patient {req.patientId}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.post("/baseline", response_model=BaselineResponse, dependencies=[Depends(verify_ml_key)], tags=["Analytics"])
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


@app.post("/decline", response_model=DeclineResponse, dependencies=[Depends(verify_ml_key)], tags=["Early Detection"])
def decline_detection(req: DeclineRequest) -> DeclineResponse:
    """
    Evaluates recent performance against the patient's personal baseline using z-scores:
    - Compares elder strictly against their own normal (never population limits)
    - If patient has no baseline yet or is in calibration (< 14 days), returns decline: false with reason 'Baseline not ready'
    - Uses z-score and multi-day persistence checks from decline/detector.py
    - Requires multi-day persistence to eliminate false alarms from transient bad days
    - Flags mild, moderate, or sharp decline severity
    """
    try:
        recent_metrics = list(req.recent or [])

        # Format sent by backend mlClient: { patientId, sessions: [...], baseline: {...} }
        if req.sessions is not None:
            if not req.sessions:
                return DeclineResponse(
                    patientId=req.patientId,
                    decline=False,
                    declined=False,
                    score=0.0,
                    zScore=0.0,
                    metric="none",
                    severity="none",
                    flagged=False,
                    persistenceCount=0,
                    reason="No sessions provided for decline evaluation",
                    notes="No sessions provided for decline evaluation",
                )

            accuracies = [s.accuracy for s in req.sessions]
            response_times = [s.responseTimeMs for s in req.sessions]
            recent_metrics = [
                RecentMetric(metric="accuracy", values=accuracies),
                RecentMetric(metric="responseTimeMs", values=response_times),
            ]

        res = evaluate_decline(
            patient_id=req.patientId,
            recent_metrics=recent_metrics,
            baseline_map=req.baseline or {},
        )
        return res

    except Exception as e:
        logger.error(f"Error detecting decline for patient {req.patientId}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
