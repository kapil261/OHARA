import cron from 'node-cron';
import { env } from '../config/env.js';
import { hasConsent } from '../lib/consent.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { checkDecline, recomputeBaselines } from '../modules/games/service.js';
import { purgeDeletedPatients } from '../modules/privacy/service.js';
import { deviceSilentTick } from './deviceSilent.js';
import { reminderTick } from './reminders.js';

/** Run `fn` on `expr`, skipping a run while the previous one is still going. */
function schedule(name: string, expr: string, fn: () => Promise<unknown>) {
  let running = false;
  cron.schedule(
    expr,
    async () => {
      if (running) return;
      running = true;
      try {
        await fn();
      } catch (err) {
        logger.error({ err, job: name }, 'job failed');
      } finally {
        running = false;
      }
    },
    { timezone: env.DEFAULT_TIMEZONE },
  );
}

/** Start background jobs. Run them on exactly one instance (ENABLE_JOBS=false elsewhere). */
export function startJobs() {
  schedule('reminders', '* * * * *', reminderTick);
  schedule('device-silent', '7 * * * *', deviceSilentTick);

  // 02:30 every night (IST): refresh personal baselines and run decline detection for everyone with analytics consent.
  schedule('nightly-analysis', '30 2 * * *', async () => {
    const patients = await prisma.patient.findMany({ where: { deletedAt: null }, select: { id: true } });
    for (const p of patients) {
      if (!(await hasConsent(p.id, 'analytics'))) continue;
      await recomputeBaselines(p.id);
      await checkDecline(p.id);
    }
  });

  // 03:15 every night: permanently remove patients whose delete grace period has ended.
  schedule('purge', '15 3 * * *', purgeDeletedPatients);

  logger.info('jobs started: reminders (every minute), device-silent (hourly), nightly analysis, purge');
}
