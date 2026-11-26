import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env, features, isProd } from './config/env.js';
import { healthReport } from './lib/health.js';
import { requestLogger } from './lib/logger.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { alertsRouter } from './modules/alerts/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { contentRouter } from './modules/content/routes.js';
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
  app.use(requestLogger);
  app.use(helmet());
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: true, exposedHeaders: ['X-Request-Id'] }));
  app.use(cookieParser());
  // ASR uploads base64 audio, so allow a few MB.
  app.use(express.json({ limit: '4mb' }));

  // Liveness: the process is up. Cheap enough for frequent platform probes.
  app.get('/api/health/live', (_req, res) => {
    res.json({ ok: true, service: 'ohara-backend', time: new Date().toISOString() });
  });

  // Readiness: also checks the database and the AI service. Point the hosting health check here.
  app.get('/api/health', async (_req, res) => {
    const { httpStatus, body } = await healthReport();
    if (isProd) {
      // Do not leak connection error details publicly.
      for (const c of Object.values(body.checks)) delete c.error;
    }
    res.status(httpStatus).json({ ...body, service: 'ohara-backend', time: new Date().toISOString(), features });
  });

  // Friendly landing for anyone opening the API base URL in a browser.
  app.get(['/', '/api'], (_req, res) => {
    res.json({ ok: true, service: 'ohara-backend', message: 'OHARA API is running. Open the frontend to use the app.', health: '/api/health' });
  });

  app.use('/api', apiLimiter);
  for (const r of [
    authRouter, meRouter, devicesRouter, patientsRouter, remindersRouter, alertsRouter, mediaRouter, familyRouter,
    gamesRouter, progressRouter, teamRouter, healthWorkerRouter, syncRouter, pushRouter, voiceRouter, privacyRouter, contentRouter,
  ]) app.use('/api', r);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
