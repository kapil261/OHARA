import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env, features } from './config/env.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { alertsRouter } from './modules/alerts/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { devicesRouter } from './modules/devices/routes.js';
import { familyRouter } from './modules/family/routes.js';
import { gamesRouter } from './modules/games/routes.js';
import { healthWorkerRouter } from './modules/healthworker/routes.js';
import { meRouter } from './modules/me/routes.js';
import { mediaRouter } from './modules/media/routes.js';
import { patientsRouter } from './modules/patients/routes.js';
import { privacyRouter } from './modules/privacy/routes.js';
import { progressRouter } from './modules/progress/routes.js';
import { pushRouter } from './modules/push/routes.js';
import { remindersRouter } from './modules/reminders/routes.js';
import { syncRouter } from './modules/sync/routes.js';
import { teamRouter } from './modules/team/routes.js';
import { voiceRouter } from './modules/voice/routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: true }));
  app.use(cookieParser());
  // ASR uploads base64 audio, so allow a few MB.
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'ohara-backend', time: new Date().toISOString(), features });
  });

  // Friendly landing for anyone opening the API base URL in a browser.
  app.get(['/', '/api'], (_req, res) => {
    res.json({ ok: true, service: 'ohara-backend', message: 'OHARA API is running. Open the frontend to use the app.', health: '/api/health' });
  });

  app.use('/api', apiLimiter);
  for (const r of [
    authRouter, meRouter, devicesRouter, patientsRouter, remindersRouter, alertsRouter, mediaRouter, familyRouter,
    gamesRouter, progressRouter, teamRouter, healthWorkerRouter, syncRouter, pushRouter, voiceRouter, privacyRouter,
  ]) app.use('/api', r);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
