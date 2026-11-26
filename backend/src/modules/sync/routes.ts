import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../utils/errors.js';
import { consentStatus } from '../../lib/consent.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth } from '../../middleware/auth.js';
import { sosSchema } from '../alerts/routes.js';
import { raiseSos } from '../alerts/service.js';
import { alertDto } from '../common.js';
import { toDtos } from '../family/routes.js';
import { recordSession, sessionSchema } from '../games/routes.js';
import { daySchedule, recordReminderEvent, reminderEventSchema } from '../reminders/routes.js';

export const syncRouter = Router();

const pushBody = z.object({
  reminderEvents: z.array(reminderEventSchema.and(z.object({ reminderId: z.string().min(1) }))).max(200).default([]),
  sessions: z.array(sessionSchema).max(200).default([]),
  sos: z.array(sosSchema.extend({ clientId: z.string().min(8).max(64) })).max(20).default([]),
});

type ItemResult = { clientId?: string; ok: boolean; duplicate?: boolean; error?: { code: string; message: string } };

async function each<T extends { clientId?: string }>(items: T[], fn: (x: T) => Promise<{ duplicate?: boolean }>): Promise<ItemResult[]> {
  const out: ItemResult[] = [];
  // Sequential on purpose: keeps event order for the same reminder.
  for (const item of items) {
    try {
      const r = await fn(item);
      out.push({ clientId: item.clientId, ok: true, duplicate: Boolean(r.duplicate) });
    } catch (err) {
      const e = err instanceof AppError ? { code: err.code, message: err.message } : { code: 'INTERNAL', message: 'Could not store this item' };
      if (!(err instanceof AppError)) logger.error({ err }, 'sync item failed');
      out.push({ clientId: item.clientId, ok: false, error: e });
    }
  }
  return out;
}

/** Upload actions queued while the patient device was offline. Each item reports its own result. */
syncRouter.post('/patients/:patientId/sync', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const body = parse(pushBody, req.body);
  const patientId = req.access!.patientId;
  const reminderEvents = await each(body.reminderEvents, ({ reminderId, ...ev }) => recordReminderEvent(patientId, reminderId, ev));
  const sessions = await each(body.sessions, (s) => recordSession(patientId, s));
  const sos = await each(body.sos, (s) => raiseSos(patientId, s.clientId, s.at ? new Date(s.at) : undefined, s.note, s.location));
  res.json({ reminderEvents, sessions, sos, serverTime: new Date().toISOString() });
});

/** Everything the patient screen needs to work offline for the day. */
syncRouter.get('/patients/:patientId/sync', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const patientId = req.access!.patientId;
  const schedule = await daySchedule(patientId);
  const [family, alerts, packs, consent] = await Promise.all([
    prisma.familyMember.findMany({ where: { patientId }, orderBy: { createdAt: 'asc' } }).then(toDtos),
    prisma.alert.findMany({ where: { patientId, acknowledged: false }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.culturePack.findMany({ where: { version: { gt: 0 } }, select: { region: true, version: true } }),
    consentStatus(patientId),
  ]);
  res.json({
    schedule,
    family,
    alerts: alerts.map((a) => alertDto(a, schedule.timezone)),
    // The phone downloads GET /content/packs/:region when its stored version is older.
    contentVersions: Object.fromEntries(packs.map((p) => [p.region, p.version])),
    consent,
    serverTime: new Date().toISOString(),
  });
});
