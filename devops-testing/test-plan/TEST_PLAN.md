# OHARA – Test Plan and Test Report

**Owner:** Aditi Vishwakarma (DevOps and Testing) | **Branch:** `Aditi/feat/devops-testing` | **Last updated:** 2026-11-26

This document describes how OHARA is tested, what tests exist today, what has been verified, and what is still open. It covers the frontend, the backend API and the AI/ML service. OHARA supports care and early detection; it does not diagnose, so tests check that flags are raised and handled correctly, not clinical accuracy.

---

## 1. Test Strategy

| Level | What it checks | Tool | Where it runs | Status |
|---|---|---|---|---|
| Static checks | Type safety and build | `tsc --noEmit`, `vite build`, `tsc` | CI and local | In place |
| Unit tests (backend) | Time, schedule, baseline and ML client logic | Vitest | CI and local | In place (22 tests) |
| Unit tests (AI service) | Elo, baseline, decline detector, API contract | pytest | CI and local | In place (32 tests) |
| Unit tests (frontend) | Components, game engine, stores | Vitest + Testing Library | CI | **Not written yet** |
| API integration | Real HTTP calls against a running backend with seed data | Scripted HTTP calls | Local | Done once (61/61, see 5.3) |
| Container / environment | Whole stack starts and is healthy | Docker Compose | Local and CI image build | Done (see 5.2) |
| End-to-end (browser) | Full user journeys | Playwright | Local | **Not written yet** |
| PWA / accessibility | Installable, offline, contrast, touch targets | Lighthouse | Manual | **Not done yet** |

Rules: a Pull Request merges into `main` only when CI is green and a teammate has reviewed it. Only synthetic data is used; no real patient data and no secrets are committed (`.env` is git-ignored, only `.env.example` is committed).

---

## 2. Test Environments

| Environment | How to start | Notes |
|---|---|---|
| Local, per module | `npm run dev` in `backend/` and `Frontend/`, `uvicorn` for `ai/` | Local Postgres via `npm run db:local` |
| Local, full stack | `cd devops-testing && cp .env.example .env && docker compose up --build` | Services: postgres (5432), ai (8000), backend (4000), frontend (5173) |
| CI | GitHub Actions, `.github/workflows/ci.yml` | Runs on every PR into `main` |

Email OTP codes are printed in the backend log when SMTP is not configured. Cloudinary, push and Bhashini are off in test environments, so no external API cost is incurred.

---

## 3. Continuous Integration (`ci.yml`)

Runs on every Pull Request into `main`.

| Job | Steps |
|---|---|
| Frontend | `npm ci`, `npm run typecheck`, `vitest run --passWithNoTests`, `npm run build` |
| Backend | `npm ci`, `prisma generate`, `npm run typecheck`, `npm test`, `npm run build` |
| AI service | `pip install -r requirements.txt`, `pytest` |
| Docker images build | `docker compose build` (runs after the three jobs above pass) |

---

## 4. Automated Test Inventory

### 4.1 Backend (Vitest, 5 files, 22 tests)

| File | Tests | What is covered |
|---|---|---|
| `app.test.ts` | 4 | Health endpoint and feature flags, JSON 404 for unknown routes, 401 without a token, malformed OTP request rejected before touching the DB |
| `baseline.test.ts` | 5 | Median, EWMA and std; decline needs enough history; accuracy drop is flagged; normal variation stays quiet; next level moves up on wins and stays within 1 to 5 |
| `mlClient.test.ts` | 4 | `X-ML-Key` header and payload sent to `/difficulty`; baseline sent to `/decline`; 401 from AI service logs a warning and falls back to local logic; fallback when the AI service is down |
| `schedule.test.ts` | 4 | Day schedule sorted by time and "next" item marked; snoozed item takes the next slot; status mapping; empty `daysOfWeek` means every day |
| `time.test.ts` | 5 | Asia/Kolkata to UTC conversion, DST zones, date and time round trip, month and year end arithmetic, input validation |

### 4.2 AI service (pytest, 4 files, 32 tests)

| File | Tests | What is covered |
|---|---|---|
| `test_api.py` | 11 | `/health`, version, 401 without API key, `/difficulty`, `/baseline` and `/decline` in both request formats, empty input, single-session filter, very large response times |
| `test_baseline.py` | 5 | Empty baseline, 14-day initial baseline, "establishing" status under 14 days, EWMA update, zero-variance handling |
| `test_decline.py` | 10 | Stable patient raises no alert, a single bad day is ignored, persistent accuracy decline is detected, latency decline, cold-start suppression, missing baseline, empty and single-session input, extreme response times |
| `test_elo.py` | 6 | Level mapping, expected success probability, errorless-learning outcomes, level changes limited to one step, no history keeps the current level |

### 4.3 Frontend

No test files exist yet. CI skips this step with `--passWithNoTests`. See section 7.

---

## 5. Test Results

### 5.1 CI on Pull Request #4 (2026-11-26)

| Job | Result |
|---|---|
| Frontend (typecheck, test, build) | PASS |
| AI service (pytest) | PASS |
| Backend (typecheck, test, build) | **FAIL at typecheck**, see 6 |
| Docker images build | Skipped (runs only after the other three pass) |

On the earlier CI run (before the AI code was merged into `main`) Frontend and Backend passed, and the AI job failed only because the `ai/` folder was not on `main` yet.

### 5.2 Docker Compose stack (verified 2026-11-26)

`docker compose up --build` from `devops-testing/` on a Windows laptop (Docker Desktop, WSL2):

| Check | Result |
|---|---|
| All images build (frontend, backend, ai) | PASS |
| 4 containers start and report healthy (postgres, ai, backend, frontend) | PASS |
| Backend starts with `ml: true` (production mode, `ML_API_KEY` set) | PASS |
| AI service starts in PRODUCTION mode, `X-ML-Key` header enforced, CORS restricted to the backend | PASS |
| Database schema synced by Prisma on start; data survives `docker compose down` | PASS |
| Frontend served by nginx on port 5173, login page loads | PASS |
| Backend calling the AI service for a real `/difficulty` or `/decline` request | **Not yet verified** (needs a game session played in the app) |

### 5.3 Live API tests (from `test-results.txt`, 2026-11-23, by Kapil)

61 of 61 live HTTP checks passed against the backend with seed data, covering public routes, security (401, CORS), validation (400), auth (wrong and correct OTP), caregiver reads, reminder create, edit, snooze, done and delete, family management, permission checks (403 without "export" or "delete" permission), game session recording and SOS. At that date the backend suite had 18 tests in 4 files (all passing); `mlClient.test.ts` was added afterwards.

---

## 6. Known Issues

| ID | Issue | Severity | Owner | Status |
|---|---|---|---|---|
| 1 | CI typecheck fails: `backend/tests/mlClient.test.ts(11,26): TS2304 Cannot find name 'HeadersInit'`. The test file came in with the AI integration PR. `main` itself is affected, and the later CI steps (`npm test`, `npm run build`) are skipped. Suggested fix: type `capturedHeaders` as `any` or `Record<string, string>` | P2 | Abhishek | Reported, waiting for fix |
| 2 | Frontend has no automated tests | P2 | Kapil, Aditi | Open |
| 3 | Backend calling the AI service end to end is not yet verified inside Docker | P3 | Aditi | Open |

Bugs are tracked as GitHub Issues with labels `bug`, `frontend`, `backend`, `ai`, `devops` and `P1/P2/P3`, including steps to reproduce, expected versus actual result, and a screenshot.

---

## 7. Remaining Work

- [ ] Re-run CI after Issue 1 is fixed; confirm all four jobs pass; merge PR #4
- [ ] Add 3 to 4 frontend unit tests (for example the game engine in `Frontend/src/features/games/engine.ts` and the stores)
- [ ] Add 1 to 2 Playwright E2E tests: caregiver login with OTP; elder marks a reminder "Done" and the caregiver sees it
- [ ] Verify backend to AI service calls inside Docker by playing one game and checking for `POST /difficulty 200` in the AI log
- [ ] Lighthouse PWA and accessibility audit (the app has no service worker or manifest yet, so a PWA pass is not expected)
- [ ] Manual usability checklist: touch targets 56px or larger, font 20px or larger, contrast meets WCAG AA, no scores or red crosses or failure wording in patient mode
- [ ] Update this report with final numbers before submission

---

## 8. How to Run the Tests

```bash
# Backend
cd backend && npm ci && npx prisma generate && npm run typecheck && npm test && npm run build

# Frontend
cd Frontend && npm ci && npm run typecheck && npx vitest run --passWithNoTests && npm run build

# AI service
cd ai && pip install -r requirements.txt && python -m pytest -q

# Full stack
cd devops-testing && cp .env.example .env && docker compose up --build
```

Backend tests need these variables when run outside CI: `NODE_ENV=test`, `JWT_SECRET`, `DATABASE_URL`, `DIRECT_URL` (dummy values are fine, the tests do not touch a real database).