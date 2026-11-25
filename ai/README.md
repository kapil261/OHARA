# OHARA – AI / ML Service

**Owner:** Anya Jain | **Branch:** `Anya/feat/AI-LLM`

FastAPI microservice providing adaptive cognitive game difficulty (Elo rating with errorless learning) and personal baseline cognitive decline detection (Z-scores with multi-day persistence filtering) for dementia care. It is called by the OHARA backend only (never directly by the frontend).

> **Clinical Notice:** OHARA supports cognitive care and early detection monitoring. It does **not** provide clinical diagnosis. Outputs are alerting signals for caregivers and clinicians to review.

---

## Tech Stack & Dependency Optimization
Lean, pinned dependencies for minimal Docker image size and rapid cold starts:
- **Python**: 3.12
- **fastapi** `==0.115.6`
- **uvicorn[standard]** `==0.32.1`
- **pydantic** `==2.14.3`
- **numpy** `==1.26.3`
- **pytest** `==8.3.4`
- **httpx** `==0.28.1`

*(Note: Unused dependencies like `pandas` and `scikit-learn` were eliminated to drastically reduce container footprint on free tier hosting).*

---

## Security & Architecture

1. **Authentication (`X-ML-Key` Header)**:
   - All computational endpoints (`/difficulty`, `/baseline`, `/decline`) require the `X-ML-Key` header matching `ML_API_KEY` (defaults to `ohara-ml-secret-key` in development).
   - Requests without a valid key return `401 Unauthorized`.
   - `/health` and `/version` remain open for orchestrator liveness and status checks.

2. **Locked-Down CORS**:
   - Browser cross-origin wildcarding (`*`) with credentials is removed.
   - CORS is restricted strictly to backend origins (`BACKEND_ORIGIN`, e.g. `http://localhost:4000`, `http://127.0.0.1:4000`).

3. **Unified Success Target**:
   - Both the AI microservice and backend local heuristics share an identical target success rate of **78% (`TARGET_SUCCESS_RATE = 0.78`)**.

4. **Self-Baseline Comparison Only**:
   - The `/decline` endpoint evaluates elders strictly against their own established normal (never arbitrary population thresholds like accuracy < 62% or latency > 3.2s).

---

## Unified API Contract (Agreed with Backend)

### 1. `POST /difficulty`
Calculates next adaptive level using Elo rating with errorless learning dignity credit (hinted successes count as 0.7 partial credit). Level changes are clamped to at most ±1 per session.

**Headers:** `X-ML-Key: <ML_API_KEY>`, `Content-Type: application/json`

**Request:**
```json
{
  "patientId": "p-101",
  "gameId": "memory-match",
  "level": 2,
  "accuracy": 0.85,
  "responseTimeMs": 1400.0,
  "hintsUsed": 1
}
```

**Response:**
```json
{
  "patientId": "p-101",
  "gameId": "memory-match",
  "game": "memory-match",
  "level": 3,
  "skill": 1220.5,
  "targetSuccess": 0.78,
  "targetSuccessRate": 0.78,
  "reason": "Recent accuracy 0.85 above target 0.78 -> advance level to 3"
}
```
*Backend reads: `level`.*

---

### 2. `POST /decline`
Evaluates multi-day performance against the patient's personal baseline using Z-scores. Requires multi-day persistence (minimum 3 sessions or all available if ≥2) to avoid false alarms from transient bad days. Cold start baseline calibration (< 14 days) suppresses alarms.

**Headers:** `X-ML-Key: <ML_API_KEY>`, `Content-Type: application/json`

**Request:**
```json
{
  "patientId": "p-101",
  "sessions": [
    { "accuracy": 0.45, "responseTimeMs": 3500.0, "playedAt": "2026-11-25T10:00:00.000Z" },
    { "accuracy": 0.40, "responseTimeMs": 3600.0, "playedAt": "2026-11-25T11:00:00.000Z" },
    { "accuracy": 0.42, "responseTimeMs": 3400.0, "playedAt": "2026-11-25T12:00:00.000Z" }
  ],
  "baseline": {
    "accuracy": { "median": 0.80, "ewma": 0.78, "std": 0.06, "count": 14 },
    "responseTimeMs": { "median": 1800.0, "ewma": 1800.0, "std": 200.0, "count": 14 }
  }
}
```

**Response:**
```json
{
  "patientId": "p-101",
  "decline": true,
  "declined": true,
  "score": -5.92,
  "zScore": -5.92,
  "metric": "accuracy",
  "severity": "sharp",
  "flagged": true,
  "persistenceCount": 3,
  "reason": "Metric 'accuracy' recent mean is 0.423 vs baseline EWMA 0.780 (z=-5.95). Persisted for 3/3 recent observations.",
  "notes": "Metric 'accuracy' recent mean is 0.423 vs baseline EWMA 0.780 (z=-5.95). Persisted for 3/3 recent observations."
}
```
*Backend reads: `decline`, `score`, `reason`.*

---

### 3. `POST /baseline`
Bootstraps personal 14-day median baseline or updates Exponentially Weighted Moving Average (EWMA with $\alpha = 0.08$).

**Headers:** `X-ML-Key: <ML_API_KEY>`, `Content-Type: application/json`

**Request:**
```json
{
  "patientId": "p-101",
  "metric": "accuracy",
  "dailyValues": [0.75, 0.80, 0.78, 0.82, 0.77, 0.79, 0.81, 0.76, 0.80, 0.78, 0.82, 0.85, 0.79, 0.81],
  "existingBaseline": {
    "median": 0.80,
    "ewma": 0.78,
    "std": 0.05,
    "count": 14
  }
}
```

**Response:**
```json
{
  "patientId": "p-101",
  "metric": "accuracy",
  "status": "established",
  "daysCounted": 15,
  "median": 0.80,
  "ewma": 0.78,
  "std": 0.05
}
```

---

### 4. `GET /version`
Telemetry endpoint reporting service version, target success rate, and active mathematical models.

**Response:**
```json
{
  "service": "ohara-ai",
  "version": "1.0.0",
  "targetSuccessRate": 0.78,
  "models": {
    "difficulty": "Elo Rating (errorless learning dignity credit 0.7, step clamp +/-1)",
    "baseline": "14-day Median Bootstrap + EWMA (alpha=0.08)",
    "decline": "Z-score Multi-day Persistence Filter (>=3 days, elder self-baseline)"
  }
}
```

---

### 5. `GET /health`
Liveness probe for orchestrators and Docker health checks.

**Response:**
```json
{
  "status": "ok",
  "service": "ohara-ai",
  "version": "1.0.0"
}
```

---

## Setup & Testing

### Run Tests:
```bash
cd ai
pip install -r requirements.txt
pytest -q
```

All 31 test cases (including Elo rating, 14-day bootstrap, EWMA updates, cold start suppression, multi-day persistence filtering, empty sessions, single session isolation, extreme response times, API key enforcement, and `/version`) pass cleanly.
