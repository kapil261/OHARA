import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requireAuth, requireUser } from '../../middleware/auth.js';
import { forbidden } from '../../utils/errors.js';
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
