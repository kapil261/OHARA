# OHARA – Backend

**Owner:** Abhishek Verma & kapil Goyal | **Branch:** `feature/backend`

REST API for OHARA: auth, patients, reminders, family media, alerts, sync, reports. Talks to the Python ML service and to Bhashini and MSG91.

## Tech Stack
| Purpose | Tool |
|---|---|
| Runtime / framework | Node.js 20, Express, TypeScript |
| Database / ORM | PostgreSQL, Prisma |
| Validation | Zod |
| Auth | Phone OTP + JWT |
| File storage | S3-compatible (photos, voice clips) |
| Scheduling | node-cron |
| Notifications | Web Push, MSG91 (SMS) |
| Tests | Vitest + Supertest |
| DevOps | Docker, GitHub Actions |

## Folder Structure (layered)
```
backend/
├── prisma/            # schema.prisma, migrations, seed
├── src/
│   ├── routes/        # HTTP routes only
│   ├── controllers/   # request/response handling
│   ├── services/      # business logic
│   ├── repositories/  # Prisma queries
│   ├── middleware/    # auth, role guard, validation, rate limit, errors
│   ├── jobs/          # cron: reminder scheduler, missed-dose escalation, baseline
│   ├── integrations/  # bhashini, msg91, mlClient, s3, webpush
│   ├── schemas/       # Zod schemas
│   ├── utils/
│   └── server.ts
└── tests/
```

## Data Model (Prisma, main entities)
- **User** (id, phone, name, role: CAREGIVER | HEALTH_WORKER | ADMIN)
- **Patient** (name, age, language, regionPack, guardianConsentAt)
- **CareTeamMember** (patientId, userId, relation)
- **Device** (patientId, pairingCode, pushSubscription, lastSeenAt)
- **Consent** (patientId, type, grantedAt, revokedAt)
- **Reminder** (patientId, type: MEDICINE | WATER | MEAL | APPOINTMENT, time, recurrence, voiceClipId)
- **ReminderEvent** (reminderId, status: DONE | MISSED | SNOOZED, at)
- **MediaItem** (patientId, kind: PHOTO | VOICE, url, label, personName)
- **GameSession** (patientId, game, level, accuracy, responseTimeMs, hintsUsed, playedAt)
- **Baseline** (patientId, metric, median, ewma, updatedAt)
- **Alert** (patientId, type: MISSED_DOSE | DECLINE | SOS | INACTIVITY, severity, status, ackedBy)
- **CulturePack** (region, items JSON, audio refs)
- **AuditLog** (actorId, action, entity, at)

## API Endpoints (v1)
| Area | Endpoints |
|---|---|
| Auth | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout` |
| Patients | `POST /patients`, `GET /patients/:id`, `PATCH /patients/:id`, `GET /patients` (care team) |
| Consent | `POST /patients/:id/consent`, `DELETE /patients/:id/consent/:type`, `GET /patients/:id/export`, `DELETE /patients/:id` |
| Pairing | `POST /patients/:id/pair-code`, `POST /devices/pair` |
| Care team | `POST /patients/:id/team`, `DELETE /patients/:id/team/:userId` |
| Reminders | `GET/POST /patients/:id/reminders`, `PATCH/DELETE /reminders/:id`, `POST /reminders/:id/events` |
| Media | `POST /patients/:id/media/upload-url`, `POST /patients/:id/media`, `GET /patients/:id/media`, `DELETE /media/:id` |
| Games | `GET /patients/:id/games/next-level`, `POST /patients/:id/game-sessions` |
| Alerts | `GET /patients/:id/alerts`, `POST /alerts/:id/ack`, `POST /patients/:id/sos` |
| Analytics | `GET /patients/:id/progress`, `GET /patients/:id/report.pdf` |
| Sync | `POST /sync/push` (outbox batch), `GET /sync/pull?since=` |
| Voice | `POST /voice/tts`, `POST /voice/asr` (Bhashini proxy) |
| Push | `POST /push/subscribe` |
| Content | `GET /culture-packs/:region` |
| Admin | `POST /admin/culture-packs`, `GET /admin/users` |

All routes validate input with Zod and check role plus care-team membership.

## Key Flows
**OTP login:** request OTP → MSG91 SMS → verify → issue JWT access (15 min) + refresh token (httpOnly cookie). Rate limit OTP requests per phone.

**Reminder and escalation (cron, every minute):**
1. Reminder due → Web Push to patient device
2. Not acknowledged after N min → mark MISSED, push to caregivers
3. Still unacknowledged → SMS to care team (MSG91)

**Sync:** `/sync/push` accepts a batch of outbox items with client UUIDs; duplicates are ignored (idempotent). `/sync/pull` returns changes since a timestamp.

**Decline detection:** after each game session, call the ML service with recent metrics. If it returns a decline flag, create an Alert and notify the care team. Nightly job refreshes baselines.

**SOS:** creates a critical Alert, push plus SMS to all care team members immediately.

## ML Service Contract (Anya)
- `POST {ML_URL}/difficulty` body `{ patientId, game, history[] }` → `{ level }`
- `POST {ML_URL}/baseline` body `{ patientId, metrics[] }` → `{ median, ewma }`
- `POST {ML_URL}/decline` body `{ patientId, recent[], baseline }` → `{ declined, zScore, metric }`

## Security and Privacy (DPDP Act 2023)
- Guardian consent recorded before any data is stored; revocable; data export and delete endpoints
- Secrets only in `.env` (gitignored), never in the client
- Signed, short-lived upload and download URLs for media
- Role and care-team checks on every route; audit log for sensitive actions (consent, export, delete, alert ack)
- Helmet, CORS allowlist, rate limiting, Zod validation

## Setup
```bash
cd backend
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
npm run test
```

`.env.example`:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/ohara
JWT_SECRET=
REFRESH_SECRET=
MSG91_AUTH_KEY=
MSG91_TEMPLATE_ID=
BHASHINI_USER_ID=
BHASHINI_API_KEY=
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
ML_URL=http://localhost:8000
CORS_ORIGIN=http://localhost:5173
```

## Task Checklist
- [ ] M2: repo, Docker, CI, Prisma schema, OTP login, patient onboarding + consent, device pairing
- [ ] M4: reminders CRUD and scheduler, media upload, care team
- [ ] M5: sync endpoints, SOS, Web Push, missed-dose SMS escalation
- [ ] M6: Bhashini proxy, ML service client
- [ ] M7: progress endpoints, weekly PDF report, culture pack admin, health worker queries
- [ ] M8: unit and integration tests, deployment, API docs

## Conventions
Branch from `main`, PR into `main` with one review. Layered flow: route → controller → service → repository. Consistent error format `{ error: { code, message } }`. Never commit `.env` or API keys. Share the API contract with the frontend (Kapil) and ML (Anya) before changing it.
