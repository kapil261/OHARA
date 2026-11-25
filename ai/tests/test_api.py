"""Integration tests for FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import ML_API_KEY

client = TestClient(app)
AUTH_HEADERS = {"X-ML-Key": ML_API_KEY}


def test_health_check_endpoint():
    """Health check endpoint is public and unauthenticated."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "ohara-ai"
    assert "version" in data


def test_version_endpoint():
    """Version endpoint returns service version, target success rate, and active models."""
    res = client.get("/version")
    assert res.status_code == 200
    data = res.json()
    assert data["service"] == "ohara-ai"
    assert data["version"] == "1.0.0"
    assert data["targetSuccessRate"] == 0.78
    assert "difficulty" in data["models"]
    assert "baseline" in data["models"]
    assert "decline" in data["models"]


def test_unauthorized_without_api_key():
    """Protected computational endpoints require valid X-ML-Key."""
    # Missing header -> 401
    res1 = client.post("/difficulty", json={"patientId": "p1", "level": 1, "accuracy": 0.8})
    assert res1.status_code == 401

    res2 = client.post("/baseline", json={"patientId": "p1", "dailyValues": [0.8, 0.85]})
    assert res2.status_code == 401

    res3 = client.post("/decline", json={"patientId": "p1", "sessions": []})
    assert res3.status_code == 401

    # Invalid header -> 401
    res4 = client.post(
        "/difficulty",
        json={"patientId": "p1", "level": 1, "accuracy": 0.8},
        headers={"X-ML-Key": "wrong-key"},
    )
    assert res4.status_code == 401


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
    res = client.post("/difficulty", json=payload, headers=AUTH_HEADERS)
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
    res = client.post("/difficulty", json=payload, headers=AUTH_HEADERS)
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
    res = client.post("/baseline", json=payload, headers=AUTH_HEADERS)
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
    res = client.post("/decline", json=payload, headers=AUTH_HEADERS)
    assert res.status_code == 200
    data = res.json()
    assert data["patientId"] == "p1"
    assert data["declined"] is True
    assert data["decline"] is True  # backend compatibility
    assert data["severity"] == "sharp"
    assert data["metric"] == "accuracy"
    assert data["zScore"] < -4.0


def test_decline_endpoint_backend_ml_client_format_with_baseline():
    # Direct payload as sent by backend/src/integrations/mlClient.ts with personal baseline
    payload = {
        "patientId": "p1",
        "sessions": [
            {"accuracy": 0.45, "responseTimeMs": 3500, "playedAt": "2026-11-24T10:00:00Z"},
            {"accuracy": 0.40, "responseTimeMs": 3600, "playedAt": "2026-11-24T11:00:00Z"},
            {"accuracy": 0.42, "responseTimeMs": 3400, "playedAt": "2026-11-24T12:00:00Z"},
        ],
        "baseline": {
            "accuracy": {"median": 0.80, "ewma": 0.78, "std": 0.06, "count": 14},
            "responseTimeMs": {"median": 1800.0, "ewma": 1800.0, "std": 200.0, "count": 14},
        },
    }
    res = client.post("/decline", json=payload, headers=AUTH_HEADERS)
    assert res.status_code == 200
    data = res.json()
    assert data["patientId"] == "p1"
    assert data["decline"] is True
    assert data["declined"] is True
    assert data["score"] < -4.0
    assert "reason" in data


def test_decline_empty_sessions_input():
    """Edge case: Empty sessions array should cleanly return no decline without errors."""
    payload = {
        "patientId": "p1",
        "sessions": [],
        "baseline": {
            "accuracy": {"median": 0.80, "ewma": 0.78, "std": 0.06, "count": 14}
        },
    }
    res = client.post("/decline", json=payload, headers=AUTH_HEADERS)
    assert res.status_code == 200
    data = res.json()
    assert data["decline"] is False
    assert data["declined"] is False
    assert data["persistenceCount"] == 0
    assert "No sessions provided" in data["reason"]


def test_decline_single_session_persistence_filter():
    """Edge case: A single bad session should NOT trigger persistent decline."""
    payload = {
        "patientId": "p1",
        "sessions": [
            {"accuracy": 0.35, "responseTimeMs": 4500, "playedAt": "2026-11-24T10:00:00Z"}
        ],
        "baseline": {
            "accuracy": {"median": 0.80, "ewma": 0.78, "std": 0.06, "count": 14},
            "responseTimeMs": {"median": 1800.0, "ewma": 1800.0, "std": 200.0, "count": 14},
        },
    }
    res = client.post("/decline", json=payload, headers=AUTH_HEADERS)
    assert res.status_code == 200
    data = res.json()
    # Single bad session does NOT meet the multi-day persistence requirement (requires >= 2 observations)
    assert data["decline"] is False
    assert data["declined"] is False
    assert data["severity"] == "none"


def test_decline_very_large_response_times():
    """Edge case: Very large response times (extreme latency/long pauses) handled safely without overflow."""
    payload = {
        "patientId": "p1",
        "sessions": [
            {"accuracy": 0.80, "responseTimeMs": 600000.0, "playedAt": "2026-11-24T10:00:00Z"},
            {"accuracy": 0.80, "responseTimeMs": 650000.0, "playedAt": "2026-11-24T11:00:00Z"},
            {"accuracy": 0.80, "responseTimeMs": 700000.0, "playedAt": "2026-11-24T12:00:00Z"},
        ],
        "baseline": {
            "responseTimeMs": {"median": 1800.0, "ewma": 1800.0, "std": 200.0, "count": 14},
        },
    }
    res = client.post("/decline", json=payload, headers=AUTH_HEADERS)
    assert res.status_code == 200
    data = res.json()
    assert data["decline"] is True
    assert data["declined"] is True
    assert data["metric"] == "responseTimeMs"
    assert data["severity"] == "sharp"
    assert data["zScore"] > 1000.0  # Safe large z-score computation
