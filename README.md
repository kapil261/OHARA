# OHARA – Where Every Memory Matters

An AI-powered, voice-first and offline-capable cognitive care companion (installable Progressive Web App) for elders with dementia or memory decline in the North Eastern Region of India, and for the families and health workers who look after them.

> B.Tech (CSIT) Major Project, Acropolis Institute of Technology and Research, Indore (RGPV Bhopal), Session July–Dec 2026.
> Based on Smart India Hackathon problem **SIH26003** (Ministry of DoNER): *AI-Based Cognitive Gaming and Memory Assistance Platform for Elderly Dementia Patients in the North Eastern Region.*

**Disclaimer:** OHARA supports care and early detection. It does **not** diagnose or replace a doctor. It is evidence-informed but not yet clinically validated.

---

## Problem

About 7.4% of Indians aged 60+ live with dementia (~8.8 million people) and only about 1 in 10 is diagnosed. In the North East, specialists are few, terrain is hilly, networks are weak, elders speak local languages (Assamese, Bodo, Manipuri) and many young family members have migrated for work. Existing apps are English-first, need constant internet, and are built for healthy adults or clinics.

## Solution

OHARA is built for the North East rather than translated for it. It speaks the elder's language, in their family's voice, with their own memories, even when the network is gone.

### Three connected parts
| Part | Users | Purpose |
|---|---|---|
| Patient mode | Elder | Voice-first, big buttons, no reading needed |
| Caregiver dashboard | Family (even from far away) | Set schedules, upload photos/voice, view status, respond to alerts |
| Health worker view | ASHA workers, doctors | Monitor trends and compliance across many patients |

### Key features
- **4 adaptive cognitive games:** Memory Match, Who is this?, My Day, Sounds of Home
- **Reminders** for medicines, water, meals and appointments, played in a family member's recorded voice
- **Family photo and voice album** for reminiscence
- **One-touch SOS** that works without mobile data
- **Personal baseline tracking** with decline alerts (elders are compared only with themselves)
- **Regional speech** via Bhashini (Assamese, Bodo, Manipuri)
- **Offline-first** with automatic sync and SMS fallback
- **Culture packs** (starting with Assam) for festivals, foods, sounds and routines
- **Weekly report** downloadable to share with a doctor

### Design principles
No red crosses, scores or comparisons with others; every session ends on a win; errorless learning with gentle hints; guardian consent recorded before any data is collected (DPDP Act, 2023).

## AI / Techniques
- Elo-based adaptive difficulty targeting ~78% success
- Personal baseline from a 14-day median, updated with an exponentially weighted moving average (EWMA)
- Z-score based decline detection
- Offline-first PWA with IndexedDB outbox and push/pull sync
- Push → SMS alert escalation ladder for missed doses

## Tech Stack
| Layer | Technologies |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, Dexie (IndexedDB), Workbox PWA |
| Backend | Node.js 20, Express, Prisma ORM, PostgreSQL, Zod, JWT + phone OTP, S3-compatible storage, node-cron, Web Push |
| ML service | Python 3.11, FastAPI, pandas, NumPy, scikit-learn |
| Integrations | Bhashini (speech and translation), MSG91 (SMS) |
| DevOps / Testing | Git, GitHub Actions, Docker, Vitest, Playwright, pytest |

## Project Structure (planned)
```
OHARA/
├── frontend/      # React PWA (patient, caregiver, health worker)
├── backend/       # Node/Express API
├── ml-service/    # FastAPI adaptive difficulty + decline detection
├── tests/         # E2E and integration tests
├── docs/          # Wireframes, schema, architecture
└── README.md
```

## Team
| Member | Enrollment No. | Role | Branch |
|---|---|---|---|
| Kapil Goyal | 0827CI231057 | Frontend | `feature/frontend` |
| Abhishek Verma | 0827CI231005 | Backend | `feature/backend` |
| Anya Jain | 0827CI231023 | ML service | `feature/ml-service` |
| Aditi Vishwakarma | 0827CI231008 | UI/UX, Bhashini, testing | `feature/ux-bhashini-testing` |

**Guides:** Prof. Nisha Rathi, Prof. Ashish Anjana (CSIT, AITR Indore)

## Roadmap (~16 weeks)
1. Requirement analysis and design (2 wks)
2. Project setup, OTP login, consent, device pairing (2 wks)
3. Cognitive games and game engine (3 wks)
4. Reminders, family photos/voice, care team (2 wks)
5. Offline sync, alerts, SOS, Web Push, SMS (2 wks)
6. Bhashini voice and Elo-based adaptive AI (2 wks)
7. Analytics, baselines, weekly PDF report, culture pack admin, health worker view (2 wks)
8. Testing, deployment, documentation (1 wk)



