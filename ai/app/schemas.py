"""Pydantic v2 schemas for the OHARA AI/ML Service."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# --- Health & Version Checks ---
class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "ohara-ai"
    version: str = "1.0.0"


class VersionResponse(BaseModel):
    service: str = "ohara-ai"
    version: str = "1.0.0"
    targetSuccessRate: float = 0.78
    models: Dict[str, str] = Field(default_factory=dict)


# --- Difficulty / Elo Schemas ---
class RoundHistoryItem(BaseModel):
    level: Optional[int] = 1
    accuracy: float = Field(default=1.0, ge=0.0, le=1.0)
    hintsUsed: int = Field(default=0, ge=0)
    completed: bool = True
    responseTimeMs: Optional[float] = None


class DifficultyRequest(BaseModel):
    patientId: str
    gameId: Optional[str] = None
    game: Optional[str] = None
    level: Optional[int] = None
    currentLevel: Optional[int] = None
    currentSkill: Optional[float] = None
    accuracy: Optional[float] = None
    responseTimeMs: Optional[float] = None
    hintsUsed: Optional[int] = None
    history: List[RoundHistoryItem] = Field(default_factory=list)


class DifficultyResponse(BaseModel):
    patientId: str
    game: str
    gameId: Optional[str] = None
    level: int
    skill: float
    targetSuccess: float = 0.78
    targetSuccessRate: Optional[float] = 0.78
    reason: Optional[str] = None


# --- Baseline Schemas ---
class BaselineStats(BaseModel):
    median: float
    ewma: float
    std: float
    count: Optional[int] = None
    sampleSize: Optional[int] = None


class MetricSeries(BaseModel):
    metric: str
    values: List[float] = Field(default_factory=list)


class BaselineRequest(BaseModel):
    patientId: str
    metric: Optional[str] = None
    dailyValues: Optional[List[float]] = None
    metrics: Optional[List[MetricSeries]] = None
    existingBaseline: Optional[BaselineStats] = None


class BaselineResponse(BaseModel):
    patientId: str
    metric: Optional[str] = None
    status: str  # "establishing" (< 14 days) or "established" (>= 14 days)
    daysCounted: int
    median: float
    ewma: float
    std: float


# --- Decline Detection Schemas ---
class RecentMetric(BaseModel):
    metric: str
    values: List[float] = Field(default_factory=list)


class BaselineMetricData(BaseModel):
    ewma: float
    std: float
    median: Optional[float] = None
    count: Optional[int] = None
    sampleSize: Optional[int] = None

    def get_sample_count(self) -> Optional[int]:
        return self.count if self.count is not None else self.sampleSize


class SessionHistoryItem(BaseModel):
    accuracy: float
    responseTimeMs: float
    playedAt: Optional[str] = None


class DeclineRequest(BaseModel):
    patientId: str
    # Format sent by backend mlClient.ts:
    sessions: Optional[List[SessionHistoryItem]] = None
    # Flexible metric format specified in README:
    recent: Optional[List[RecentMetric]] = Field(default_factory=list)
    # Personal baseline map sent by backend or caller:
    baseline: Optional[Dict[str, BaselineMetricData]] = Field(default_factory=dict)


class DeclineResponse(BaseModel):
    patientId: str
    decline: bool = False  # Direct compatibility with backend mlClient.ts
    declined: bool = False
    score: float = 0.0  # Direct compatibility with backend mlClient.ts (z-score)
    zScore: float = 0.0
    metric: str = "none"
    severity: str = "none"  # "none" | "mild" | "moderate" | "sharp"
    flagged: bool = False
    persistenceCount: int = 0
    reason: str = ""  # Direct compatibility with backend mlClient.ts
    notes: str = ""
