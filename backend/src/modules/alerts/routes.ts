import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth, requireUser } from '../../middleware/auth.js';
import { notFound } from '../../utils/errors.js';
import { alertDto } from '../common.js';
import { raiseSos } from './service.js';

export const alertsRouter = Router();

/** open = nobody has picked it up; acknowledged = someone is handling it; resolved = closed. */
const STATUS_WHERE: Record<'open' | 'acknowledged' | 'resolved' | 'all', Prisma.AlertWhereInput> = {
  open: { acknowledged: false, resolved: false },
  acknowledged: { acknowledged: true, resolved: false },
  resolved: { resolved: true },
  all: {},
};

const listQuery = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

alertsRouter.get('/patients/:patientId/alerts', requireAuth, requirePatientAccess('view'), async (req, res) => {
  const q = parse(listQuery, req.query);
  const patientId = req.access!.patientId;
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { timezone: true } });
  const alerts = await prisma.alert.findMany({
    where: { patientId, ...STATUS_WHERE[q.status] },
    orderBy: { createdAt: 'desc' },
    take: q.limit,
  });
  res.json(alerts.map((a) => alertDto(a, patient.timezone)));
});

/** Every alert across all patients the caregiver looks after (the Alerts page), newest first, with counts per status. */
alertsRouter.get('/alerts', requireAuth, requireUser, async (req, res) => {
  const q = parse(listQuery, req.query);
  const patientScope: Prisma.PatientWhereInput =
    req.auth!.role === 'ADMIN' ? { deletedAt: null } : { deletedAt: null, team: { some: { userId: req.auth!.sub } } };
  const base: Prisma.AlertWhereInput = { patient: patientScope };
  const [alerts, open, acknowledged, resolved] = await Promise.all([
    prisma.alert.findMany({
      where: { ...base, ...STATUS_WHERE[q.status] },
      include: { patient: { select: { displayName: true, timezone: true } } },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
    }),
    prisma.alert.count({ where: { ...base, ...STATUS_WHERE.open } }),
    prisma.alert.count({ where: { ...base, ...STATUS_WHERE.acknowledged } }),
    prisma.alert.count({ where: { ...base, ...STATUS_WHERE.resolved } }),
  ]);
  res.json({
    counts: { open, acknowledged, resolved, all: open + acknowledged + resolved },
    items: alerts.map(({ patient, ...a }) => ({ ...alertDto(a, patient.timezone), patientName: patient.displayName })),
  });
});

async function findAlert(patientId: string, alertId: string) {
  const a = await prisma.alert.findFirst({ where: { id: alertId, patientId } });
  if (!a) throw notFound('Alert');
  return a;
}

/** Tells the rest of the team someone is handling it; also stops SMS / email escalation for missed reminders. */
alertsRouter.post('/patients/:patientId/alerts/:alertId/ack', requireAuth, requireUser, requirePatientAccess('view'), async (req, res) => {
  const patientId = req.access!.patientId;
  const existing = await findAlert(patientId, String(req.params.alertId));
  const a = existing.acknowledged
    ? existing
    : await prisma.alert.update({ where: { id: existing.id }, data: { acknowledged: true, acknowledgedAt: new Date(), acknowledgedBy: req.auth!.sub } });
  if (!existing.acknowledged) await audit('alert.acknowledged', { actorId: req.auth!.sub, patientId, meta: { alertId: a.id } });
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { timezone: true } });
  res.json(alertDto(a, patient.timezone));
});

/** Closes the alert with an optional note. Resolving also acknowledges it. */
alertsRouter.post('/patients/:patientId/alerts/:alertId/resolve', requireAuth, requireUser, requirePatientAccess('view'), async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().max(500).optional() }), req.body ?? {});
  const patientId = req.access!.patientId;
  const existing = await findAlert(patientId, String(req.params.alertId));
  const now = new Date();
  const a = existing.resolved
    ? existing
    : await prisma.alert.update({
        where: { id: existing.id },
        data: {
          resolved: true,
          resolvedAt: now,
          resolvedBy: req.auth!.sub,
          resolutionNote: body.note ?? null,
          ...(existing.acknowledged ? {} : { acknowledged: true, acknowledgedAt: now, acknowledgedBy: req.auth!.sub }),
        },
      });
  if (!existing.resolved) await audit('alert.resolved', { actorId: req.auth!.sub, patientId, meta: { alertId: a.id } });
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { timezone: true } });
  res.json(alertDto(a, patient.timezone));
});

export const sosSchema = z.object({
  clientId: z.string().max(64).optional(),
  at: z.string().datetime().optional(),
  note: z.string().max(200).optional(),
  location: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100_000).optional() })
    .optional(),
});

/** SOS: works from the patient device or a caregiver. Idempotent by clientId. */
alertsRouter.post('/patients/:patientId/sos', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const body = parse(sosSchema, req.body ?? {});
  const patientId = req.access!.patientId;
  const { alert, duplicate } = await raiseSos(patientId, body.clientId, body.at ? new Date(body.at) : undefined, body.note, body.location);
  if (!duplicate) await audit('alert.sos', { actorId: req.auth!.kind === 'user' ? req.auth!.sub : null, patientId, meta: { alertId: alert.id, viaDevice: req.access!.viaDevice } });
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { timezone: true } });
  res.status(duplicate ? 200 : 201).json(alertDto(alert, patient.timezone));
});
