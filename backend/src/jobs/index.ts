import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { recomputeBaselines } from '../modules/games/service.js';
import { reminderTick } from './reminders.js';

let running = false;

/** Start background jobs. Overlapping runs are skipped. */
export function startJobs() {
  cron.schedule('* * * * *', async () => {
    if (running) return;
    running = true;
    try {
      await reminderTick();
    } catch (err) {
      console.error('[jobs] reminder tick failed', err);
    } finally {
      running = false;
    }
  });

  // 02:30 every night: refresh personal baselines.
  cron.schedule('30 2 * * *', async () => {
    try {
      const patients = await prisma.patient.findMany({ where: { deletedAt: null }, select: { id: true } });
      for (const p of patients) await recomputeBaselines(p.id);
    } catch (err) {
      console.error('[jobs] baselines failed', err);
    }
  });
  console.log('[jobs] reminder (every minute) and baseline (nightly) jobs started');
}
