import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { CONSENT_SCOPES, consentStatus } from '../../lib/consent.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth, requireUser } from '../../middleware/auth.js';
import { userLabel } from '../../utils/contact.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { localDate } from '../../utils/time.js';
import { patientDto } from '../common.js';
import { purgeDateFor } from './service.js';

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

/** Effective on/off per kind of data, for the Settings switches. */
privacyRouter.get('/patients/:patientId/consent/status', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  res.json(await consentStatus(req.access!.patientId));
});

privacyRouter.post('/patients/:patientId/consent', requireAuth, requireUser, requirePatientAccess('manage_team'), async (req, res) => {
  const body = parse(
    z.object({ scope: z.enum(CONSENT_SCOPES).default('care_data'), guardian: z.boolean().default(true), text: z.string().max(2000).optional() }),
    req.body,
  );
  const patientId = req.access!.patientId;
  // One active consent per scope: granting again returns the existing record.
  const active = await prisma.consent.findFirst({ where: { patientId, scope: body.scope, revokedAt: null } });
  if (active) return res.status(200).json(consentDto(active));
  const c = await prisma.consent.create({ data: { ...body, patientId, grantedById: req.auth!.sub } });
  await audit('consent.granted', { actorId: req.auth!.sub, patientId, meta: { consentId: c.id, scope: c.scope } });
  res.status(201).json(consentDto(c));
});

privacyRouter.post('/patients/:patientId/consent/:consentId/revoke', requireAuth, requireUser, requirePatientAccess('manage_team'), async (req, res) => {
  const patientId = req.access!.patientId;
  const existing = await prisma.consent.findFirst({ where: { id: String(req.params.consentId), patientId } });
  if (!existing) throw notFound('Consent');
  const c = existing.revokedAt ? existing : await prisma.consent.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  await audit('consent.revoked', { actorId: req.auth!.sub, patientId, meta: { consentId: c.id, scope: c.scope } });
  res.json(consentDto(c));
});

async function exportData(id: string) {
  const data = await prisma.patient.findUnique({
    where: { id },
    include: {
      team: { include: { user: { select: { email: true, phone: true, name: true } } } },
      devices: { select: { id: true, label: true, model: true, appVersion: true, lastSeenAt: true, revokedAt: true, createdAt: true } },
      reminders: true,
      occurrences: true,
      events: true,
      alerts: true,
      family: true,
      media: true,
      sessions: true,
      baselines: true,
      consents: true,
      visitNotes: true,
    },
  });
  if (!data) throw notFound('Patient');
  return data;
}

/** Full JSON export of everything stored about the patient (media as metadata; files stay in Cloudinary). */
privacyRouter.get('/patients/:patientId/export', requireAuth, requireUser, requirePatientAccess('export'), async (req, res) => {
  const id = req.access!.patientId;
  const data = await exportData(id);
  await audit('patient.exported', { actorId: req.auth!.sub, patientId: id, meta: { format: 'json' } });
  res.setHeader('Content-Disposition', `attachment; filename="ohara-export-${localDate(new Date(), data.timezone)}.json"`);
  res.json({ exportedAt: new Date().toISOString(), patient: data });
});

/** Human-readable PDF of the same export (counts and lists, no raw ids). */
privacyRouter.get('/patients/:patientId/export.pdf', requireAuth, requireUser, requirePatientAccess('export'), async (req, res) => {
  const id = req.access!.patientId;
  const d = await exportData(id);
  await audit('patient.exported', { actorId: req.auth!.sub, patientId: id, meta: { format: 'pdf' } });
  const tz = d.timezone;
  const when = (x: Date) => x.toLocaleString('en-IN', { timeZone: tz });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ohara-export-${localDate(new Date(), tz)}.pdf"`);
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);
  const section = (title: string) => doc.moveDown().fontSize(13).fillColor('#000').text(title).fontSize(10);

  doc.fontSize(20).text('OHARA data export');
  doc.fontSize(10).fillColor('#555').text(`Everything stored about this person, exported ${when(new Date())} (${tz}).`);
  section('Profile');
  doc.text(`${d.fullName ?? d.displayName}${d.age ? `, age ${d.age}` : ''}${d.place ? `, ${d.place}` : ''}. Language: ${d.language}. Voice answers: ${d.voiceAnswers ? 'on' : 'off'}.`);
  section('Care team');
  for (const m of d.team) doc.text(`  ${userLabel(m.user)}${m.relation ? ` (${m.relation})` : ''}${m.isOwner ? ' — owner' : ''}: ${m.isOwner ? 'all permissions' : m.permissions.join(', ') || 'none'}`);
  section('Consent');
  for (const c of d.consents) doc.text(`  ${c.scope}: granted ${when(c.grantedAt)}${c.revokedAt ? `, revoked ${when(c.revokedAt)}` : ' (active)'}`);
  section('Reminders');
  for (const r of d.reminders) doc.text(`  ${r.time} ${r.title} (${r.kind.toLowerCase()})${r.active ? '' : ' — paused'}${r.alertIfMissed ? ', alerts if missed' : ''}`);
  const done = d.occurrences.filter((o) => o.status === 'DONE').length;
  const missed = d.occurrences.filter((o) => o.status === 'MISSED').length;
  doc.text(`  ${d.occurrences.length} reminder occurrences on record: ${done} done, ${missed} missed.`);
  section('Games');
  doc.text(`  ${d.sessions.length} game sessions on record.`);
  for (const b of d.baselines) doc.text(`  Baseline ${b.metric}: usual ${Math.round(b.median * 100) / 100} (${b.sampleSize} sessions)`);
  section('Alerts');
  doc.text(`  ${d.alerts.length} alerts on record.`);
  for (const a of d.alerts.slice(0, 30)) doc.text(`  ${when(a.createdAt)} [${a.severity}] ${a.title}${a.resolved ? ' — resolved' : a.acknowledged ? ' — acknowledged' : ''}`);
  section('Family and media');
  doc.text(`  ${d.family.length} family members, ${d.media.length} photos / voice clips (files stay in the media store).`);
  for (const f of d.family) doc.text(`  ${f.name} (${f.relation})`);
  section('Devices');
  for (const dv of d.devices) doc.text(`  ${dv.label ?? 'Device'}${dv.model ? ` — ${dv.model}` : ''}, paired ${when(dv.createdAt)}${dv.revokedAt ? ', revoked' : ''}`);
  if (d.visitNotes.length) {
    section('Visit notes');
    for (const n of d.visitNotes) doc.text(`  ${when(n.visitedAt)}: ${n.text}`);
  }
  doc.end();
});

/**
 * Delete (owner only). The patient is hidden from every route immediately and permanently
 * removed after DELETE_GRACE_DAYS; until then the owner can restore it.
 */
privacyRouter.delete('/patients/:patientId', requireAuth, requireUser, requirePatientAccess('delete'), async (req, res) => {
  const id = req.access!.patientId;
  if (!req.access!.isOwner && req.auth!.role !== 'ADMIN') throw forbidden('Only the owner can delete this patient');
  const now = new Date();
  await prisma.$transaction([
    prisma.patient.update({ where: { id }, data: { deletedAt: now } }),
    prisma.device.updateMany({ where: { patientId: id, revokedAt: null }, data: { revokedAt: now } }),
    prisma.user.updateMany({ where: { activePatientId: id }, data: { activePatientId: null } }),
  ]);
  await audit('patient.deleted', { actorId: req.auth!.sub, patientId: id, meta: { purgeAt: purgeDateFor(now).toISOString() } });
  res.status(200).json({ deleted: true, purgeAt: purgeDateFor(now).toISOString() });
});

/** Undo a delete during the grace period (owner or admin). Paired devices stay revoked and must be paired again. */
privacyRouter.post('/patients/:patientId/restore', requireAuth, requireUser, async (req, res) => {
  const id = String(req.params.patientId);
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient?.deletedAt) throw notFound('Deleted patient');
  if (req.auth!.role !== 'ADMIN') {
    const member = await prisma.careTeamMember.findUnique({ where: { patientId_userId: { patientId: id, userId: req.auth!.sub } } });
    if (!member?.isOwner) throw forbidden('Only the owner can restore this patient');
  }
  if (purgeDateFor(patient.deletedAt) <= new Date()) throw badRequest('The grace period has ended; this patient can no longer be restored');
  const p = await prisma.patient.update({ where: { id }, data: { deletedAt: null } });
  await prisma.user.updateMany({ where: { id: req.auth!.sub, activePatientId: null }, data: { activePatientId: id } });
  await audit('patient.restored', { actorId: req.auth!.sub, patientId: id });
  res.json(await patientDto(p));
});

/** Patients the user deleted that can still be restored. */
privacyRouter.get('/patients-deleted', requireAuth, requireUser, async (req, res) => {
  const rows = await prisma.patient.findMany({
    where: { deletedAt: { not: null }, ...(req.auth!.role === 'ADMIN' ? {} : { team: { some: { userId: req.auth!.sub, isOwner: true } } }) },
    select: { id: true, displayName: true, deletedAt: true },
  });
  res.json(rows.map((p) => ({ id: p.id, displayName: p.displayName, deletedAt: p.deletedAt!.toISOString(), purgeAt: purgeDateFor(p.deletedAt!).toISOString() })));
});
