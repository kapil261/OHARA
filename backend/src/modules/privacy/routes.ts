import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth, requireUser } from '../../middleware/auth.js';
import { forbidden, notFound } from '../../utils/errors.js';
import { localDate } from '../../utils/time.js';

/** DPDP-style consent, data export and deletion. */
export const privacyRouter = Router();

const consentDto = (c: { id: string; scope: string; guardian: boolean; text: string | null; grantedAt: Date; revokedAt: Date | null; grantedById: string }) => ({
  id: c.id,
  scope: c.scope,
  guardian: c.guardian,
  text: c.text,
  grantedById: c.grantedById,
  grantedAt: c.grantedAt.toISOString(),
  revokedAt: c.revokedAt?.toISOString() ?? null,
  active: !c.revokedAt,
});

privacyRouter.get('/patients/:patientId/consent', requireAuth, requireUser, requirePatientAccess('view'), async (req, res) => {
  const rows = await prisma.consent.findMany({ where: { patientId: req.access!.patientId }, orderBy: { grantedAt: 'desc' } });
  res.json(rows.map(consentDto));
});

privacyRouter.post('/patients/:patientId/consent', requireAuth, requireUser, requirePatientAccess('manage_team'), async (req, res) => {
  const body = parse(
    z.object({ scope: z.string().trim().min(1).max(40).default('care_data'), guardian: z.boolean().default(true), text: z.string().max(2000).optional() }),
    req.body,
  );
  const c = await prisma.consent.create({ data: { ...body, patientId: req.access!.patientId, grantedById: req.auth!.sub } });
  await audit('consent.granted', { actorId: req.auth!.sub, patientId: c.patientId, meta: { consentId: c.id, scope: c.scope } });
  res.status(201).json(consentDto(c));
});

privacyRouter.post('/patients/:patientId/consent/:consentId/revoke', requireAuth, requireUser, requirePatientAccess('manage_team'), async (req, res) => {
  const patientId = req.access!.patientId;
  const existing = await prisma.consent.findFirst({ where: { id: String(req.params.consentId), patientId } });
  if (!existing) throw notFound('Consent');
  const c = existing.revokedAt ? existing : await prisma.consent.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  await audit('consent.revoked', { actorId: req.auth!.sub, patientId, meta: { consentId: c.id } });
  res.json(consentDto(c));
});

/** Full JSON export of everything stored about the patient (media as metadata; files stay in Cloudinary). */
privacyRouter.get('/patients/:patientId/export', requireAuth, requireUser, requirePatientAccess('export'), async (req, res) => {
  const id = req.access!.patientId;
  const data = await prisma.patient.findUnique({
    where: { id },
    include: {
      team: { include: { user: { select: { email: true, name: true } } } },
      devices: { select: { id: true, label: true, lastSeenAt: true, revokedAt: true, createdAt: true } },
      reminders: true,
      occurrences: true,
      events: true,
      alerts: true,
      family: true,
      media: true,
      sessions: true,
      baselines: true,
      consents: true,
    },
  });
  if (!data) throw notFound('Patient');
  await audit('patient.exported', { actorId: req.auth!.sub, patientId: id });
  res.setHeader('Content-Disposition', `attachment; filename="ohara-export-${localDate(new Date(), data.timezone)}.json"`);
  res.json({ exportedAt: new Date().toISOString(), patient: data });
});

/** Soft delete (owner only). Hidden from every route immediately. */
privacyRouter.delete('/patients/:patientId', requireAuth, requireUser, requirePatientAccess('delete'), async (req, res) => {
  const id = req.access!.patientId;
  if (!req.access!.isOwner && req.auth!.role !== 'ADMIN') throw forbidden('Only the owner can delete this patient');
  await prisma.$transaction([
    prisma.patient.update({ where: { id }, data: { deletedAt: new Date() } }),
    prisma.device.updateMany({ where: { patientId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.user.updateMany({ where: { activePatientId: id }, data: { activePatientId: null } }),
  ]);
  await audit('patient.deleted', { actorId: req.auth!.sub, patientId: id });
  res.status(204).end();
});
