# OHARA backend

The API for the OHARA frontend. It is built with Express 5, TypeScript, and Prisma on Postgres. Every service it uses has a free tier, and each one is optional during local development.

| Concern | Service (free) | Fallback when not configured |
|---|---|---|
| Database | **Supabase** Postgres, or the bundled local Postgres | — (required) |
| Media (photos, voice) | **Cloudinary** free plan | Upload routes return `503 MEDIA_NOT_CONFIGURED` |
| OTP and alert messages | **Email** over any SMTP (Gmail app password, Brevo, Ethereal) | Dev only: emails, including OTP codes, are **printed to the server console**. Production refuses to start without SMTP or MSG91. |
| SMS (sign-in codes by phone, alert SMS) | **MSG91** with DLT-approved Flow templates | Dev only: SMS are printed to the console. In production, phone sign-in returns `503 SMS_NOT_CONFIGURED`. |
| Push notifications | Web Push with self-hosted VAPID keys | Push is disabled; email alerts still work |
| Voice (TTS/ASR) | Bhashini (Government of India) | `503`; the app uses browser speech. *Bhashini is not yet tested against the live API.* |
| Decline detection | ML service (`ML_URL`) | A local statistical baseline (median/EWMA/z-score) |

`GET /api/health` shows which of these are turned on.

## Run locally (no accounts needed)

```bash
cd backend
npm install
cp .env.example .env          # then set DATABASE_URL and DIRECT_URL as shown below
```

The local Postgres uses this setting for both URLs in `.env`:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/ohara"
DIRECT_URL="postgresql://postgres:postgres@localhost:5433/ohara"
```

```bash
# Terminal 1: embedded Postgres on port 5433.
# Data is kept in ~/.local/share/ohara-pg; change it with LOCAL_PG_DIR.
npm run db:local

# Terminal 2
npm run db:deploy             # apply prisma/migrations (creates the tables)
npm run db:seed               # demo data (wipes everything first; refuses when NODE_ENV=production)
npm run dev                   # http://localhost:4000
```

The local database is created as UTF-8 (needed for Assamese and Hindi text). If you created it before this fix and seeding fails with `has no equivalent in encoding "WIN1252"`, delete the data folder (or drop the `ohara` database) and run `npm run db:local` again.

Postgres needs its data folder to have `0700` permissions. A Windows drive mounted in WSL (`/mnt/c`, `/mnt/e`) can't provide that, which is why the data lives in your Linux home.

Then run the frontend (`cd Frontend && npm run dev`) with `VITE_API_URL=http://localhost:4000/api` set in `Frontend/.env`.

### Signing in

Enter one of the emails below on the login page. Without SMTP, the 6-digit code is printed in the backend terminal:

```
[mail:console] To: rina@example.com
Subject: Your OHARA sign-in code: 123456
```

| Email | Role | Notes |
|---|---|---|
| `rina@example.com` | Caregiver | Owner of patient **Bina Kalita**; has every permission |
| `arup@example.com` | Caregiver | Can view, schedule, and upload for Bina |
| `mousumi@example.com` | Health worker | Can see all 6 patients |
| `dr.bora@example.com` | Health worker | Can view and export for Bina |
| `admin@example.com` | Admin | |
| `pranab@`, `nitu@`, `anjali@`, `bijoy@`, `rupa@example.com` | Caregivers | One each for the other 5 patients |

The seed creates 14 days of reminders and completions, game sessions and baselines, alerts (missed reminder, SOS, cognitive decline), family members, consent records, and a paired device.

## Feature reference (beyond the original endpoints)

All paths are under `/api`. "doc path" = the path used in the design docs, kept as an alias.

**Sign-in by phone**
- `POST /auth/otp/request` (alias `/auth/otp/send`) accepts `{ email }` **or** `{ phone }` (Indian mobile, any common format → `+91XXXXXXXXXX`). `POST /auth/otp/verify` likewise takes `{ email | phone, code }`.
- `POST /me/phone { phone, code }` adds a verified number to the signed-in account (request a code for that number first). `DELETE /me/phone` removes it.
- Team invites (`POST /patients/:id/team`) take `{ email }` or `{ phone }`; members have `notifyEmail` and `notifySms`.

**Alerts**
- `GET /patients/:id/alerts?status=open|acknowledged|resolved|all`, and `GET /alerts` for every patient you care for, with counts per status.
- `POST /patients/:id/alerts/:alertId/resolve { note? }` closes an alert (also acknowledges it).
- Acknowledging a missed-reminder alert stops its SMS / email escalation.
- `POST /patients/:id/sos { location?: { lat, lng, accuracy? } }` texts, emails and pushes the team at once; location is stored only with `location` consent.
- Hourly job: a paired phone silent for `DEVICE_SILENT_HOURS` (48) raises one "Phone offline" alert.

**Reminders.** Each reminder has `alertIfMissed` (defaults on for medicine and appointments). The escalation ladder, in minutes after the due time, is: ring → ring again at `REPEAT_AFTER_MIN` (10) → `MISSED` at `MISSED_AFTER_MIN` (30), with a push alert to the team → SMS at `SMS_AFTER_MIN` (45) → email at `EMAIL_AFTER_MIN` (45). A snooze is allowed `MAX_SNOOZES` (2) times; a third returns `409 SNOOZE_LIMIT`. Event responses include `snoozesLeft`. Every email and SMS is recorded in `NotificationLog`, with masked recipients.

**Games and progress**
- `GET /games` (catalogue with per-level settings), `GET /games/:id/levels`.
- `GET /patients/:id/games` (doc path `/difficulty`) adds `title`, `domain`, `playedToday` and one `suggested: true` game (least practised this week, not yet played today).
- `GET /patients/:id/progress?range=7|30|90` keeps the old fields and adds `domains` (memory, attention, recognition, routine: score vs personal baseline, plus a trend of `above baseline | steady | watch | establishing baseline | no data`), `overall`, a `daily` line (score, minutes, reminder compliance) and `compliance`.
- Weekly PDF at `/patients/:id/report.pdf` (doc path `/reports/weekly`) now includes domain scores and visit notes.

**Consent (DPDP).** Scopes are `care_data` (blanket; covers reminders, games, analytics), `reminders`, `games`, `analytics` and `location` (never implied).
- Enforced: game sessions need `games`; reminder responses need `reminders`; progress, report and decline detection need `analytics`. A missing scope returns `403 CONSENT_REQUIRED` with `details.scope`. SOS is never blocked.
- `GET /patients/:id/consent/status` returns the on/off state of each scope. Onboarding (`POST /patients`) takes `consentScopes`.

**Devices.** The docs' flow is `POST /patients/:id/devices/codes` (caregiver gets a 6-digit code, valid 10 min, single use, which cancels older codes), then `POST /devices/pair/claim { code, model?, appVersion? }` (the phone gets its token). The device list shows `model`, `appVersion`, `pairedAt` and `lastSeenAt`. The patient app may send `X-App-Version` / `X-Device-Model` headers to keep these current.

**Media.** `purpose` (e.g. `praise` for after-game clips, `greeting`, `reminder`), `GET /patients/:id/media?purpose=praise`, `usedIn` counts ("Used in 2 reminders"), and `PATCH /patients/:id/media/:mediaId` to rename.

**Patient settings.** `voiceAnswers` (the elder may say "Done") on `PATCH /patients/:id`.

**Health worker**
- `GET /health-worker/patients?flagged=true&village=Boko&q=name` adds `flags` (`decline`, `offline`, `missed_dose`), a 30-day `memoryTrend` sparkline, and `memoryScore` / `memoryBaseline` / `belowBaseline`.
- Visit notes: `POST /patients/:id/notes` (doc path `/hw/patients/:id/notes`, health workers and admins only; the family gets a push), `GET /patients/:id/notes` (whole care team), `DELETE /patients/:id/notes/:noteId` (author only).

**Privacy**
- `GET /patients/:id/export.pdf` (readable PDF next to the JSON export).
- `DELETE /patients/:id` hides the patient at once and returns `purgeAt`. `POST /patients/:id/restore` (owner, within `DELETE_GRACE_DAYS` = 30) undoes it; `GET /patients-deleted` lists restorable patients. A nightly job purges data and Cloudinary files after the grace period.

**Culture packs (admin)**
- Read: `GET /content/packs` (admins see drafts and an audio check; others see published packs only) and `GET /content/packs/:region?since=<version>` (the latest published snapshot, which phones download; returns `{ upToDate: true }` when current). Sync pull returns `contentVersions` so phones know when to download.
- Admin: `POST/PATCH/DELETE /content/packs[/:id]`, `GET /content/packs/:id/items` (draft with `missingAudio` per item), `POST /content/packs/:id/items`, `PATCH/DELETE /content/items/:id` (audio and labels merge per language), `POST /content/packs/:id/sign` (Cloudinary upload), `POST /content/packs/:id/publish[?force=true]` (freezes the next version; refuses empty packs, and refuses missing audio unless forced).

**Jobs** (run on one instance only, in IST): reminders every minute; device-silent hourly; nightly analysis at 02:30 (baselines and decline, for patients with analytics consent); purge at 03:15.

## ML Service Contract (Anya)
Every call sends the `X-ML-Key: <ML_API_KEY>` header. Any failure (down, timeout, non-2xx, 401) falls back to the local heuristics in `src/utils/baseline.ts`.
- `POST {ML_URL}/difficulty` body `{ patientId, gameId, level, accuracy, responseTimeMs, hintsUsed }` → `{ level }`
- `POST {ML_URL}/decline` body `{ patientId, sessions: [{ accuracy, responseTimeMs, playedAt }], baseline: { accuracy: { median, ewma, std, count }, responseTimeMs: { … } } }` → `{ decline, score, reason }`
- `GET {ML_URL}/health` (no key) is probed by `GET /api/health`.
- Baselines are owned by the backend (recomputed after each session and nightly, stored in `Baseline`). `POST {ML_URL}/baseline` is currently not called.

## Database migrations

Schema changes go through Prisma migrations in `prisma/migrations` (committed). Never use `db push` against a shared or production database.

```bash
# after editing prisma/schema.prisma, against your local DB:
npm run db:migrate -- --name describe_the_change   # creates prisma/migrations/<timestamp>_describe_the_change
# deploy (CI / host start or release command):
npm run db:deploy                                   # prisma migrate deploy
```

**Existing database that was created with `db push`** (e.g. the current Supabase project): mark the initial migration as already applied once, otherwise `migrate deploy` will try to recreate the tables:

```bash
npx prisma migrate resolve --applied 0_init
```

## Health checks

- `GET /api/health/live`: process is up (no dependencies). Use for liveness probes.
- `GET /api/health`: checks the database and the AI service. `200 ok`, `200 degraded` (AI down; local fallback in use), or `503 down` (database unreachable). Point the hosting platform's health check here.

## Logging

Structured JSON logs (pino) with a per-request `X-Request-Id` (echoed in responses and in 500 error bodies outside production). Emails, codes, tokens and cookies are redacted; never put them in log messages. Set `LOG_LEVEL` to change verbosity.

## Going to the free cloud services

- **Supabase**: open Project → Settings → Database → Connection string.
  - `DATABASE_URL` uses the pooled connection on port 6543, with `?pgbouncer=true&connection_limit=1`.
  - `DIRECT_URL` uses the session connection on port 5432.
  - Then run `npm run db:deploy` (see Database migrations above if the tables already exist).
- **Cloudinary**: the Dashboard shows the cloud name, API key, and secret.
- **SMTP**:
  - For Gmail, use `smtp.gmail.com:587` with an App Password.
  - For Brevo, use `smtp-relay.brevo.com:587` (300 emails per day on the free plan).
  - For testing, use https://ethereal.email.
- **VAPID**: run `npm run vapid:keys` and paste both keys into `.env`.

## Scripts

`npm run dev` · `npm test` (vitest; no DB needed) · `npm run typecheck` · `npm run build` then `npm start` · `npm run db:seed` · `npm run db:local`
