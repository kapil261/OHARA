import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { sendMail, simpleHtml } from '../../integrations/mailer.js';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { ALL_PERMISSIONS, requirePatientAccess } from '../../middleware/access.js';
import { requireAuth, requireUser } from '../../middleware/auth.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';

export const teamRouter = Router();

const permissions = z.array(z.enum(ALL_PERMISSIONS)).max(ALL_PERMISSIONS.length);
const inviteBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(80).optional(),
  relation: z.string().trim().max(80).optional(),
  role: z.enum(['CAREGIVER', 'HEALTH_WORKER']).default('CAREGIVER'),
  permissions: permissions.default(['view']),
  hue: z.string().max(20).optional(),
});
const patchBody = z.object({
  permissions: permissions.optional(),
  relation: z.string().trim().max(80).nullable().optional(),
  hue: z.string().max(20).optional(),
  notifyEmail: z.boolean().optional(),
});

type MemberRow = Prisma.CareTeamMemberGetPayload<{ include: { user: true } }>;
const memberDto = (m: MemberRow) => ({
  id: m.id,
  userId: m.userId,
  name: m.user.name ?? m.user.email.split('@')[0],
  email: m.user.email,
  role: m.relation ?? (m.memberRole === 'HEALTH_WORKER' ? 'Health worker' : 'Caregiver'),
  memberRole: m.memberRole,
  relation: m.relation,
  permissions: m.isOwner ? [...ALL_PERMISSIONS] : m.permissions,
  hue: m.hue,
  notifyEmail: m.notifyEmail,
  isOwner: m.isOwner,
});

teamRouter.get('/patients/:patientId/team', requireAuth, requireUser, requirePatientAccess('view'), async (req, res) => {
  const rows = await prisma.careTeamMember.findMany({ where: { patientId: req.access!.patientId }, include: { user: true }, orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }] });
  res.json(rows.map(memberDto));
});

teamRouter.post('/patients/:patientId/team', requireAuth, requireUser, requirePatientAccess('manage_team'), async (req, res) => {
  const body = parse(inviteBody, req.body);
  const patientId = req.access!.patientId;
  const user = await prisma.user.upsert({
    where: { email: body.email },
    create: { email: body.email, name: body.name, role: body.role, activePatientId: patientId },
    update: {},
  });
  let member: MemberRow;
  try {
    member = await prisma.careTeamMember.create({
      data: { patientId, userId: user.id, relation: body.relation, memberRole: body.role, permissions: body.permissions, hue: body.hue },
      include: { user: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict('This person is already on the care team');
    throw err;
  }

  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { displayName: true } });
  const inviter = await prisma.user.findUnique({ where: { id: req.auth!.sub }, select: { name: true, email: true } });
  const url = `${env.APP_URL.replace(/\/$/, '')}/login?email=${encodeURIComponent(body.email)}`;
  const subject = `You've been added to ${patient?.displayName ?? 'a'} care team on OHARA`;
  const lines = [
    `${inviter?.name ?? 'A family member'} added you to the care team for ${patient?.displayName ?? 'a patient'}.`,
    'Sign in with this email address; we will send you a one-time code. No password needed.',
  ];
  await sendMail({ to: body.email, subject, text: `${lines.join('\n')}\n\n${url}`, html: simpleHtml(subject, lines, { label: 'Open OHARA', url }) });
  await audit('team.invited', { actorId: req.auth!.sub, patientId, meta: { memberId: member.id, role: body.role } });
  res.status(201).json(memberDto(member));
});

teamRouter.patch('/patients/:patientId/team/:memberId', requireAuth, requireUser, requirePatientAccess('manage_team'), async (req, res) => {
  const body = parse(patchBody, req.body);
  const patientId = req.access!.patientId;
  const existing = await prisma.careTeamMember.findFirst({ where: { id: String(req.params.memberId), patientId } });
  if (!existing) throw notFound('Team member');
  if (existing.isOwner && body.permissions) throw badRequest('The owner always has full access');
  const member = await prisma.careTeamMember.update({ where: { id: existing.id }, data: body, include: { user: true } });
  await audit('team.updated', { actorId: req.auth!.sub, patientId, meta: { memberId: member.id, fields: Object.keys(body) } });
  res.json(memberDto(member));
});

teamRouter.delete('/patients/:patientId/team/:memberId', requireAuth, requireUser, requirePatientAccess('view'), async (req, res) => {
  const patientId = req.access!.patientId;
  const existing = await prisma.careTeamMember.findFirst({ where: { id: String(req.params.memberId), patientId } });
  if (!existing) throw notFound('Team member');
  if (existing.isOwner) throw badRequest('The owner cannot be removed');
  // Anyone may leave; removing someone else needs manage_team.
  const self = existing.userId === req.auth!.sub;
  if (!self && !req.access!.permissions.includes('manage_team')) throw notFound('Team member');
  await prisma.careTeamMember.delete({ where: { id: existing.id } });
  await prisma.user.updateMany({ where: { id: existing.userId, activePatientId: patientId }, data: { activePatientId: null } });
  await audit(self ? 'team.left' : 'team.removed', { actorId: req.auth!.sub, patientId, meta: { memberId: existing.id } });
  res.status(204).end();
});
