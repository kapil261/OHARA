# OHARA – DevOps and Testing

**Owner:** Aditi Vishwakarma (testing) with the whole team (CI/CD and deployment) | **Branch:** `feature/ux-bhashini-testing`

Covers Docker, CI/CD with GitHub Actions, deployment, and the test strategy for frontend, backend and AI service.

## Tools
| Purpose | Tool |
|---|---|
| Containers | Docker, Docker Compose |
| CI/CD | GitHub Actions |
| Frontend unit/component tests | Vitest + Testing Library |
| Backend unit/integration tests | Vitest + Supertest |
| AI service tests | pytest |
| End-to-end tests | Playwright |
| PWA/accessibility audit | Lighthouse |
| Lint/format | ESLint, Prettier (JS/TS), Ruff/Black (Python) |

## Folder Structure
```
devops-testing/
├── docker/
│   ├── frontend.Dockerfile
│   ├── backend.Dockerfile
│   └── ai.Dockerfile
├── docker-compose.yml        # frontend, backend, ai, postgres, minio (S3)
├── e2e/                      # Playwright tests
│   ├── playwright.config.ts
│   └── specs/
├── test-plan/
│   └── TEST_PLAN.md
└── README.md
GitHub workflows live in .github/workflows/ (repo root):
├── ci.yml                    # lint + tests on every PR
└── deploy.yml                # deploy after merge to main
```

## Docker Compose (local environment)
Services: `frontend` (5173), `backend` (4000), `ai` (8000), `postgres` (5432), `minio` (S3-compatible storage, 9000).
```bash
cp .env.example .env
docker compose up --build
```
Backend uses `ML_URL=http://ai:8000` and `DATABASE_URL` pointing at the `postgres` service.

## CI Pipeline (`ci.yml`, runs on every Pull Request)
1. Install dependencies (cached)
2. Lint and type-check: frontend, backend, ai
3. Unit tests: frontend (Vitest), backend (Vitest), ai (pytest)
4. Integration tests: backend with a Postgres service container
5. Build: frontend and backend, Docker images
6. E2E (Playwright) on the Compose stack, upload report as artifact

Rule: a PR can merge to `main` only when CI is green and one teammate has reviewed it. Enable branch protection on `main`.

## CD Pipeline (`deploy.yml`, on merge to `main`)
1. Build and push images to a registry (GitHub Container Registry)
2. SSH to the VPS (or cloud host), pull images, run `docker compose up -d`
3. Run Prisma migrations
4. Smoke test `/health` on backend and AI service

Hosting: a VPS with S3-compatible storage. Serve the frontend over HTTPS (required for PWA, service worker, push and microphone).

## Secrets
Stored in GitHub repo Settings → Secrets, never in code: `DATABASE_URL`, `JWT_SECRET`, `REFRESH_SECRET`, `MSG91_AUTH_KEY`, `BHASHINI_API_KEY`, `S3_*`, `VAPID_*`, `SSH_HOST`, `SSH_KEY`. Commit only `.env.example`.

## Test Strategy
| Level | Scope | Tool | Owner |
|---|---|---|---|
| Unit | Game engine, sync/outbox logic, services, Elo, baseline, z-score | Vitest, pytest | Each dev for own code |
| Integration | API routes with real DB, backend ↔ AI contract | Supertest, pytest | Abhishek, Anya |
| E2E | Full user journeys in a real browser | Playwright | Aditi |
| PWA / a11y | Installable, offline, contrast, touch targets | Lighthouse | Aditi, Kapil |
| Manual usability | Elder-friendliness, language, voice quality | Checklist | Aditi |

### Key E2E scenarios
1. Caregiver signs up with OTP, creates a patient, records guardian consent
2. Caregiver pairs the elder's device, adds a medicine reminder with a voice clip
3. Elder device rings the reminder, taps "Done", caregiver sees it as done
4. Reminder missed → push to caregiver → SMS escalation (SMS mocked)
5. Elder plays all 4 games; session saved; difficulty changes next time
6. **Offline:** go offline, play a game and acknowledge a reminder, come back online, data syncs with no duplicates
7. SOS pressed offline → alert reaches care team after reconnect
8. Simulated decline pattern → decline alert appears for caregiver and health worker
9. Weekly report downloads as PDF
10. Consent revoked, data export and delete work

### Offline testing in Playwright
Use `context.setOffline(true)` and check the outbox in IndexedDB, then go online and assert backend records.

### Mocks
Mock MSG91 and Bhashini in CI (no real SMS or API cost). Use a few real Bhashini calls manually before release.

### Acceptance checks
- Lighthouse PWA score passes; app installable and works offline
- Touch targets 56px+, font 20px+, contrast meets WCAG AA
- No scores, red crosses or failure wording anywhere in patient mode
- Success target around 78% on simulated patients
- Stable simulated patients produce no alerts; sharp decline is caught

## Bug Tracking
Use GitHub Issues with labels `bug`, `frontend`, `backend`, `ai`, `devops`, `P1/P2/P3`. Include steps to reproduce, expected vs actual, and screenshot.

## Task Checklist
- [ ] M1/M2: Dockerfiles, Docker Compose, `ci.yml` (lint + unit tests), branch protection on `main`
- [ ] M2: `.env.example` for every service, secrets configured in GitHub
- [ ] M3–M7: add tests along with each feature (no big-bang testing at the end)
- [ ] M5: Playwright offline/sync scenarios
- [ ] M7: simulation-based alert tests, Lighthouse audit
- [ ] M8: full E2E suite, `deploy.yml`, production deploy, smoke tests, final test report

## Conventions
Branch from `main`, PR into `main` with one review and green CI. Keep tests next to the code they test (unit) and E2E here. Never commit `.env` files, keys or real patient data; use synthetic data only.
