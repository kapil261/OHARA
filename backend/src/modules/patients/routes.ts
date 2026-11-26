import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { CONSENT_SCOPES } from '../../lib/consent.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { ALL_PERMISSIONS, requirePatientAccess } from '../../middleware/access.js';
import { requireAuth, requireUser } from '../../middleware/auth.js';
import { badRequest } from '../../utils/errors.js';
import { isValidTimeZone } from '../../utils/time.js';
import { patientDto } from '../common.js';
import { buildMe } from '../me/service.js';

export const patientsRouter = Router();

const tz = z.string().refine(isValidTimeZone, 'Unknown time zone');
const patientFields = {
  displayName: z.string().trim().min(1).max(40),
  fullName: z.string().trim().max(80).optional(),
  age: z.number().int().min(1).max(130).optional(),
  place: z.string().trim().max(80).optional(),
  language: z.string().trim().min(2).max(30).optional(),
  timezone: tz.optional(),
  voiceAnswers: z.boolean().optional(),
};

/**
 * Onboarding: the signed-in caregiver creates the patient profile and becomes its owner.
 * Guardian consent is required (the elder may not be able to consent themselves).
 */
patientsRouter.post('/patients', requireAuth, requireUser, async (req, res) => {
  const body = parse(
    z.object({
      ...patientFields,
      caregiverName: z.string().trim().min(1).max(80).optional(),
      relation: z.string().trim().max(40).optional(),
      consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required to continue' }) }),
      consentText: z.string().max(2000).optional(),
      // Which kinds of data the guardian agrees to. Default: care_data (reminders, games, analytics). Location is opt-in.
      consentScopes: z.array(z.enum(CONSENT_SCOPES)).min(1).max(CONSENT_SCOPES.length).optional(),
    }),
    req.body,
  );
  const userId = req.auth!.sub;
  const patient = await prisma.$transaction(async (tx) => {
    const p = await tx.patient.create({
      data: {
        displayName: body.displayName,
        fullName: body.fullName,
        age: body.age,
        place: body.place,
        language: body.language ?? 'English',
        timezone: body.timezone ?? 'Asia/Kolkata',
        voiceAnswers: body.voiceAnswers ?? true,
      },
    });
    await tx.careTeamMember.create({
      data: { patientId: p.id, userId, relation: body.relation, isOwner: true, permissions: [...ALL_PERMISSIONS] },
    });
    const scopes = [...new Set(body.consentScopes ?? ['care_data'])];
    await tx.consent.createMany({ data: scopes.map((scope) => ({ patientId: p.id, grantedById: userId, scope, text: body.consentText })) });
    await tx.user.update({
      where: { id: userId },
      data: { activePatientId: p.id, ...(body.caregiverName ? { name: body.caregiverName } : {}) },
    });
    return p;
  });
  await audit('patient.created', { actorId: userId, patientId: patient.id });
  res.status(201).json({ patient: await patientDto(patient), me: await buildMe(req.auth!) });
});

patientsRouter.get('/patients/:patientId', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const p = await prisma.patient.findUniqueOrThrow({ where: { id: req.access!.patientId } });
  res.json(await patientDto(p));
});

patientsRouter.patch('/patients/:patientId', requireAuth, requireUser, requirePatientAccess('manage_team'), async (req, res) => {
  const body = parse(
    z.object({
      ...patientFields,
      displayName: patientFields.displayName.optional(),
      photoMediaId: z.string().nullable().optional(),
      voiceMediaId: z.string().nullable().optional(),
    }),
    req.body,
  );
  const patientId = req.access!.patientId;
  for (const [key, kind] of [['photoMediaId', 'PHOTO'], ['voiceMediaId', 'VOICE']] as const) {
    const id = body[key];
    if (id) {
      const m = await prisma.mediaItem.findFirst({ where: { id, patientId, kind } });
      if (!m) throw badRequest(`${key} does not belong to this patient`);
    }
  }
  const p = await prisma.patient.update({ where: { id: patientId }, data: body });
  await audit('patient.updated', { actorId: req.auth!.sub, patientId, meta: { fields: Object.keys(body) } });
  res.json(await patientDto(p));
});
