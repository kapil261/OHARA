"""Pydantic v2 schemas for the OHARA AI/ML Service."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# --- Health Check ---
class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "ohara-ai"
    version: str = "1.0.0"


# --- Difficulty / Elo Schemas ---
class RoundHistoryItem(BaseModel):
    level: Optional[int] = 1
    accuracy: float = Field(default=1.0, ge=0.0, le=1.0)
    hintsUsed: int = Field(default=0, ge=0)
    completed: bool = True
    responseTimeMs: Optional[float] = None


class DifficultyRequest(BaseModel):
    patientId: str
    game: str
    currentLevel: Optional[int] = None
    currentSkill: Optional[float] = None
    history: List[RoundHistoryItem] = Field(default_factory=list)


class DifficultyResponse(BaseModel):
    patientId: str
    game: str
    level: int
    skill: float
    targetSuccess: float = 0.78
    reason: Optional[str] = None


# --- Baseline Schemas ---
class BaselineStats(BaseModel):
    median: float
    ewma: float
    std: float
    count: Optional[int] = None


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


class DeclineRequest(BaseModel):
    patientId: str
    recent: List[RecentMetric] = Field(default_factory=list)
    baseline: Dict[str, BaselineMetricData] = Field(default_factory=dict)


class DeclineResponse(BaseModel):
    patientId: str
    declined: bool
    zScore: float
    metric: str
    severity: str  # "none" | "mild" | "moderate" | "sharp"
    flagged: bool
    persistenceCount: int
    notes: str
