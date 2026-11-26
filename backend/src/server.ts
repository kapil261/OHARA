import { env, features, isTest } from './config/env.js';
import { createApp } from './app.js';
import { startJobs } from './jobs/index.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, features }, 'OHARA API listening');
  if (!features.smtp) logger.warn('No SMTP configured: emails and OTP codes are printed to the console (dev only).');
});

if (env.ENABLE_JOBS && !isTest) startJobs();

const shutdown = () => {
  server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
