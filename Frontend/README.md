# OHARA – Frontend

**Owner:** Kapil Goyal & Abhishek Verma | **Branch:** `kapil/feat/frontend`

Installable, offline-first React PWA with three modes: Patient (voice-first), Caregiver dashboard, and Health Worker view.

## Tech Stack
| Purpose | Tool |
|---|---|
| Framework / build | React 18, Vite, TypeScript |
| Styling | Tailwind CSS, shadcn/ui |
| Server state | TanStack Query |
| Client state | Zustand |
| Offline storage | Dexie (IndexedDB) |
| PWA | Workbox (vite-plugin-pwa) |
| Tests | Vitest, Playwright |

## Folder Structure
```
frontend/
├── public/            # manifest, icons, offline audio/images
├── src/
│   ├── app/           # router, providers, layouts
│   ├── features/
│   │   ├── auth/          # phone OTP login
│   │   ├── onboarding/    # patient setup, guardian consent, device pairing
│   │   ├── patient/       # home, reminder ringing, SOS
│   │   ├── games/         # engine + 4 games
│   │   ├── album/         # family photos and voice clips
│   │   ├── caregiver/     # dashboard, schedules, alerts, reports
│   │   ├── healthworker/  # patient list, trends
│   │   └── settings/      # language, consent, export/delete data
│   ├── components/    # shared UI (BigButton, AudioPlayer, ...)
│   ├── lib/           # api client, audio helpers, Zod schemas
│   ├── offline/       # Dexie db, outbox, sync engine
│   ├── store/         # Zustand stores
│   ├── i18n/          # strings per language (as, brx, mni, hi, en)
│   └── sw.ts          # service worker
└── tests/
```

## Screens
**Patient mode:** big-button home (Play, My Family, Reminders, SOS); full-screen reminder ringing with family photo and recorded voice ("Done" / "Later"); one game at a time with spoken instructions; family album; hold-to-confirm SOS that works offline.

**Caregiver dashboard:** daily status, schedule editor, photo and voice upload, alerts with acknowledge, progress charts vs the elder's own baseline, weekly PDF report, care team management.

**Health worker view:** patients sorted by "needs attention", per-patient trends.

## Games
| Game | Trains |
|---|---|
| Memory Match | Short-term memory |
| Who is this? | Recognition (family photos) |
| My Day | Routine recall |
| Sounds of Home | Attention, reminiscence |

Dignity rules: no red crosses, no visible scores, no comparison with others, wrong answer gives a gentle hint, every session ends with a win. Difficulty comes from the ML service (cached locally for offline use).

```ts
interface Game {
  id: string;
  start(level: number): Round;
  answer(roundId: string, choice: string): { correct: boolean; hint?: string };
  finish(): SessionResult; // accuracy, responseTimeMs, hintsUsed
}
```

## Offline-First and Sync
- Service worker caches app shell, game assets, culture pack, reminder audio.
- All writes (game sessions, reminder acks, SOS) go into a Dexie **outbox** first.
- On reconnect or app focus: push outbox in order, then pull changes since `lastSyncAt`.
- Each outbox item has a client UUID so retries are idempotent.
- Reminders are scheduled locally so they ring without network.
- Conflicts: last-write-wins by timestamp; SOS and acks are append-only.

## Voice and Language
Bhashini speech is called through the backend (keys never in the client). Fixed-prompt TTS audio is cached for offline use. Language is set per patient. Voice clips are recorded with `MediaRecorder` and uploaded via signed URL.

## Auth
Phone OTP → JWT (access token in memory, refresh token in httpOnly cookie). Patient device pairing by short code or QR. Route guards for `PATIENT`, `CAREGIVER`, `HEALTH_WORKER`.

## UI Rules for Elders
Touch targets 56px+, font 20px+, high contrast, one action per screen, icons plus voice, no flashing or countdowns.

## Setup
```bash
cd frontend
npm install
cp .env.example .env    # set VITE_API_URL
npm run dev
npm run test
npm run build
```

## Task Checklist
- [ ] M2: setup, routing, OTP login, onboarding + consent, device pairing
- [ ] M3: game engine, 4 games, session results
- [ ] M4: reminder ringing flow, family album, care team UI
- [ ] M5: Dexie outbox + sync engine, SOS, push subscription
- [ ] M6: voice prompts (TTS playback, ASR input)
- [ ] M7: charts, weekly report download, health worker view
- [ ] M8: Playwright E2E, Lighthouse PWA audit, bug fixes

## Conventions
Branch from `main`, PR into `main` with one review. Components PascalCase, hooks `useX`, files kebab-case. No secrets in code; use `.env` (gitignored). API details are in `../backend/README.md`.
