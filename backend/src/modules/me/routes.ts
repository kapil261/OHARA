import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requireAuth, requireUser } from '../../middleware/auth.js';
import { normalizePhone } from '../../utils/contact.js';
import { badRequest, conflict, forbidden } from '../../utils/errors.js';
import { checkOtp } from '../auth/service.js';
import { buildMe } from './service.js';

export const meRouter = Router();

meRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await buildMe(req.auth!));
});

/** Update own profile (name) and/or switch the patient a caregiver is acting on. */
meRouter.patch('/me', requireAuth, requireUser, async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(80).optional(), activePatientId: z.string().optional() }), req.body);
  if (body.activePatientId) {
    const member = await prisma.careTeamMember.findUnique({
      where: { patientId_userId: { patientId: body.activePatientId, userId: req.auth!.sub } },
    });
    if (!member && req.auth!.role !== 'ADMIN') throw forbidden('You are not on this care team');
  }
  await prisma.user.update({ where: { id: req.auth!.sub }, data: body });
  res.json(await buildMe(req.auth!));
});

/**
 * Add or change the mobile number used for SMS alerts and SMS sign-in.
 * The number must be proven first: POST /auth/otp/request { phone }, then send the code here.
 */
meRouter.post('/me/phone', requireAuth, requireUser, async (req, res) => {
  const body = parse(z.object({ phone: z.string().trim().max(16), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }), req.body);
  const phone = normalizePhone(body.phone);
  if (!phone) throw badRequest('Enter a valid Indian mobile number');
  const owner = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (owner && owner.id !== req.auth!.sub) throw conflict('This number is already used by another account');
  await checkOtp({ phone }, body.code);
  await prisma.user.update({ where: { id: req.auth!.sub }, data: { phone } });
  res.json(await buildMe(req.auth!));
});

meRouter.delete('/me/phone', requireAuth, requireUser, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub } });
  if (!user.email) throw badRequest('Add an email address before removing your only sign-in number');
  await prisma.user.update({ where: { id: user.id }, data: { phone: null } });
  res.json(await buildMe(req.auth!));
});
