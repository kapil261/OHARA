"""Integration tests for FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "ohara-ai"


def test_difficulty_endpoint_rich_format():
    payload = {
        "patientId": "p-101",
        "game": "memory-match",
        "currentLevel": 2,
        "currentSkill": 1150.0,
        "history": [
            {"level": 2, "accuracy": 1.0, "hintsUsed": 0, "completed": True},
            {"level": 2, "accuracy": 1.0, "hintsUsed": 1, "completed": True},
        ],
    }
    res = client.post("/difficulty", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["patientId"] == "p-101"
    assert data["game"] == "memory-match"
    assert "level" in data
    assert "skill" in data
    assert data["targetSuccess"] == 0.78


def test_difficulty_endpoint_backend_ml_client_format():
    # Direct payload as sent by backend/src/integrations/mlClient.ts
    payload = {
        "patientId": "p-101",
        "gameId": "memory-match",
        "level": 2,
        "accuracy": 0.85,
        "responseTimeMs": 1400,
        "hintsUsed": 1,
    }
    res = client.post("/difficulty", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["patientId"] == "p-101"
    assert "level" in data
    assert isinstance(data["level"], int)


def test_baseline_endpoint():
    payload = {
        "patientId": "p-101",
        "metric": "accuracy",
        "dailyValues": [0.75, 0.80, 0.78, 0.82, 0.77, 0.79, 0.81, 0.76, 0.80, 0.78, 0.82, 0.85, 0.79, 0.81],
    }
    res = client.post("/baseline", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["patientId"] == "p-101"
    assert data["status"] == "established"
    assert data["daysCounted"] == 14
    assert data["median"] > 0
    assert data["ewma"] > 0
    assert data["std"] > 0


def test_decline_endpoint_rich_format():
    payload = {
        "patientId": "p1",
        "recent": [{"metric": "accuracy", "values": [0.5, 0.45, 0.4]}],
        "baseline": {
            "accuracy": {"ewma": 0.78, "std": 0.06, "count": 14}
        },
    }
    res = client.post("/decline", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["patientId"] == "p1"
    assert data["declined"] is True
    assert data["decline"] is True  # backend compatibility
    assert data["severity"] == "sharp"
    assert data["metric"] == "accuracy"
    assert data["zScore"] < -4.0


def test_decline_endpoint_backend_ml_client_format():
    # Direct payload as sent by backend/src/integrations/mlClient.ts
    payload = {
        "patientId": "p1",
        "sessions": [
            {"accuracy": 0.45, "responseTimeMs": 3500, "playedAt": "2026-11-24T10:00:00Z"},
            {"accuracy": 0.40, "responseTimeMs": 3600, "playedAt": "2026-11-24T11:00:00Z"},
            {"accuracy": 0.42, "responseTimeMs": 3400, "playedAt": "2026-11-24T12:00:00Z"},
        ],
    }
    res = client.post("/decline", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["patientId"] == "p1"
    assert data["decline"] is True
    assert "score" in data
    assert "reason" in data
