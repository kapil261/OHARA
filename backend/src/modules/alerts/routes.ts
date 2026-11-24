import { Router } from 'express';
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

const listQuery = z.object({
  status: z.enum(['open', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

alertsRouter.get('/patients/:patientId/alerts', requireAuth, requirePatientAccess('view'), async (req, res) => {
  const q = parse(listQuery, req.query);
  const patientId = req.access!.patientId;
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { timezone: true } });
  const alerts = await prisma.alert.findMany({
    where: { patientId, ...(q.status === 'open' ? { acknowledged: false } : {}) },
    orderBy: { createdAt: 'desc' },
    take: q.limit,
  });
  res.json(alerts.map((a) => alertDto(a, patient.timezone)));
});

alertsRouter.post('/patients/:patientId/alerts/:alertId/ack', requireAuth, requireUser, requirePatientAccess('view'), async (req, res) => {
  const patientId = req.access!.patientId;
  const existing = await prisma.alert.findFirst({ where: { id: String(req.params.alertId), patientId } });
  if (!existing) throw notFound('Alert');
  const a = existing.acknowledged
    ? existing
    : await prisma.alert.update({ where: { id: existing.id }, data: { acknowledged: true, acknowledgedAt: new Date(), acknowledgedBy: req.auth!.sub } });
  if (!existing.acknowledged) await audit('alert.acknowledged', { actorId: req.auth!.sub, patientId, meta: { alertId: a.id } });
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { timezone: true } });
  res.json(alertDto(a, patient.timezone));
});

const sosBody = z.object({ clientId: z.string().max(64).optional(), at: z.string().datetime().optional(), note: z.string().max(200).optional() });

/** SOS: works from the patient device or a caregiver. Idempotent by clientId. */
alertsRouter.post('/patients/:patientId/sos', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const body = parse(sosBody, req.body ?? {});
  const patientId = req.access!.patientId;
  const { alert, duplicate } = await raiseSos(patientId, body.clientId, body.at ? new Date(body.at) : undefined, body.note);
  if (!duplicate) await audit('alert.sos', { actorId: req.auth!.kind === 'user' ? req.auth!.sub : null, patientId, meta: { alertId: alert.id, viaDevice: req.access!.viaDevice } });
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { timezone: true } });
  res.status(duplicate ? 200 : 201).json(alertDto(alert, patient.timezone));
});
