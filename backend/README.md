# OHARA backend

The API for the OHARA frontend. It is built with Express 5, TypeScript, and Prisma on Postgres. Every service it uses has a free tier, and each one is optional during local development.

| Concern | Service (free) | Fallback when not configured |
|---|---|---|
| Database | **Supabase** Postgres, or the bundled local Postgres | — (required) |
| Media (photos, voice) | **Cloudinary** free plan | Upload routes return `503 MEDIA_NOT_CONFIGURED` |
| OTP and alert messages | **Email** over any SMTP (Gmail app password, Brevo, Ethereal) | Emails, including OTP codes, are **printed to the server console** |
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
npx prisma db push            # create the tables
npm run db:seed               # demo data (wipes everything first; refuses when NODE_ENV=production)
npm run dev                   # http://localhost:4000
```

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

## Going to the free cloud services

- **Supabase**: open Project → Settings → Database → Connection string.
  - `DATABASE_URL` uses the pooled connection on port 6543, with `?pgbouncer=true&connection_limit=1`.
  - `DIRECT_URL` uses the session connection on port 5432.
  - Then run `npx prisma db push` (or `npm run db:deploy` once migrations exist).
- **Cloudinary**: the Dashboard shows the cloud name, API key, and secret.
- **SMTP**:
  - For Gmail, use `smtp.gmail.com:587` with an App Password.
  - For Brevo, use `smtp-relay.brevo.com:587` (300 emails per day on the free plan).
  - For testing, use https://ethereal.email.
- **VAPID**: run `npm run vapid:keys` and paste both keys into `.env`.

## Scripts

`npm run dev` · `npm test` (vitest; no DB needed) · `npm run typecheck` · `npm run build` then `npm start` · `npm run db:seed` · `npm run db:local`
