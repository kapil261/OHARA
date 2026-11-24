import { env, features, isTest } from './config/env.js';
import { createApp } from './app.js';
import { startJobs } from './jobs/index.js';
import { prisma } from './lib/prisma.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`OHARA API on http://localhost:${env.PORT}/api  (features: ${JSON.stringify(features)})`);
  if (!features.smtp) console.log('No SMTP configured: emails and OTP codes are printed here.');
});

if (env.ENABLE_JOBS && !isTest) startJobs();

const shutdown = () => {
  server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
