# OHARA – AI / ML Service

**Owner:** Anya Jain | **Branch:** `feature/ml-service`

Python FastAPI service that adapts game difficulty to each elder and detects cognitive decline against their own personal baseline. It is called by the backend only (never directly by the frontend).

> OHARA supports care and early detection. It does **not** diagnose. Outputs are flags for a caregiver or doctor to review.

## Tech Stack
Python 3.11, FastAPI, Uvicorn, pandas, NumPy, scikit-learn, Pydantic, pytest, Docker.

## Folder Structure
```
ai/
├── app/
│   ├── main.py            # FastAPI app, routes
│   ├── schemas.py         # Pydantic request/response models
│   ├── difficulty/
│   │   └── elo.py         # Elo-based adaptive difficulty
│   ├── baseline/
│   │   └── baseline.py    # 14-day median + EWMA
│   ├── decline/
│   │   └── detector.py    # z-score decline detection
│   └── config.py          # thresholds, constants
├── simulation/
│   └── simulate.py        # synthetic patients to tune thresholds
├── notebooks/             # experiments (optional)
├── tests/
├── requirements.txt
├── Dockerfile
└── README.md
```

## Features

### 1. Adaptive difficulty (Elo, errorless learning)
- Each elder has a skill rating per game; each level has a difficulty rating.
- After a round: `expected = 1 / (1 + 10^((difficulty - skill) / 400))`, then `skill += K * (outcome - expected)`.
- Goal: keep success around **75–80% (target 78%)**. If recent success is above target, raise the level; below, lower it.
- Hints are not counted as failures (errorless learning). A hinted success counts as a partial success (e.g. 0.7).
- Level changes are limited to one step per session so the game never jumps suddenly.

### 2. Personal baseline
- Metrics per patient: game accuracy, response time, reminder compliance, session frequency.
- Initial baseline = **median of the first 14 days**.
- After that, updated with an **EWMA**: `baseline = alpha * today + (1 - alpha) * baseline` (alpha around 0.1–0.2).
- Elders are compared only with their own baseline, never with other people.

### 3. Decline detection (z-score)
- `z = (recent_mean - baseline) / baseline_std` over a recent window (e.g. last 7 days).
- Flag when z is beyond a threshold on a metric, and it persists for several days (to avoid one bad day).
- Severity: mild / moderate / sharp, from z magnitude and number of metrics affected.
- Cold start: no decline flags until the 14-day baseline exists.

## API (called by the backend)
| Endpoint | Request | Response |
|---|---|---|
| `POST /difficulty` | `{ patientId, game, history[] }` | `{ level, skill, targetSuccess }` |
| `POST /baseline` | `{ patientId, metrics[] }` | `{ median, ewma, std }` |
| `POST /decline` | `{ patientId, recent[], baseline }` | `{ declined, zScore, metric, severity }` |
| `GET /health` | | `{ status: "ok" }` |

Example:
```json
POST /decline
{ "patientId": "p1",
  "recent": [{"metric":"accuracy","values":[0.5,0.45,0.4]}],
  "baseline": {"accuracy":{"ewma":0.78,"std":0.06}} }
```
```json
{ "declined": true, "zScore": -5.9, "metric": "accuracy", "severity": "sharp" }
```
The contract matches `backend/README.md`. Tell Abhishek before changing any field.

## Simulation and Tuning
Three synthetic patient types are generated: **stable**, **slow decline**, **sharp decline**. Run them through the baseline and detector to tune thresholds so that:
- stable patients rarely trigger alerts (low false positives)
- sharp decline is caught within a few days
- slow decline is caught eventually without noisy alerts

Report precision, recall and detection delay in `simulation/` results. A real pilot study is planned later; until then, state clearly that this is not clinically validated.

## Privacy
Receives only numeric metrics and a patient ID (no names, photos, audio or phone numbers). No data is stored in this service; it is stateless and the backend holds all records.

## Setup
```bash
cd ai
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
pytest
```

`requirements.txt` (starting point):
```
fastapi
uvicorn[standard]
pydantic
numpy
pandas
scikit-learn
pytest
httpx
```

## Task Checklist
- [ ] M6: FastAPI skeleton, `/health`, Pydantic schemas
- [ ] M6: Elo difficulty with errorless hint handling
- [ ] M7: baseline (14-day median + EWMA)
- [ ] M7: z-score decline detector with persistence rule
- [ ] M7: simulation of stable / slow / sharp patients and threshold tuning
- [ ] M8: pytest unit tests, Dockerfile, integration test with backend

## Conventions
Branch from `main`, PR into `main` with one review. Type-hint all functions, keep thresholds in `config.py`, never commit data files with real patient information or keys.
