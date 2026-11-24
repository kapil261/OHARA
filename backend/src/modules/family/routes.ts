import { Router } from 'express';
import { z } from 'zod';
import type { FamilyMember } from '@prisma/client';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth, requireUser } from '../../middleware/auth.js';
import { notFound } from '../../utils/errors.js';
import { mediaUrlMap } from '../common.js';
import { assertPatientMedia } from '../media/service.js';

/** Family faces used by the "Who is this?" game and the family screen. Shape matches the frontend `FamilyMember`. */
export const familyRouter = Router();

const HUES = ['violet', 'amber', 'rose', 'teal', 'sky', 'lime', 'orange', 'indigo'] as const;

const body = z.object({
  name: z.string().trim().min(1).max(60),
  relation: z.string().trim().min(1).max(40),
  place: z.string().trim().max(60).optional(),
  hue: z.string().trim().max(20).optional(),
  memory: z.string().trim().max(300).optional(),
  photoMediaId: z.string().nullable().optional(),
  voiceMediaId: z.string().nullable().optional(),
});

export async function toDtos(rows: FamilyMember[]) {
  const urls = await mediaUrlMap(rows.flatMap((f) => [f.photoMediaId, f.voiceMediaId]));
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    relation: f.relation,
    place: f.place,
    hue: f.hue,
    memory: f.memory,
    photo: f.photoMediaId ? urls.get(f.photoMediaId) : undefined,
    voice: f.voiceMediaId ? urls.get(f.voiceMediaId) : undefined,
  }));
}

familyRouter.get('/patients/:patientId/family', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const rows = await prisma.familyMember.findMany({ where: { patientId: req.access!.patientId }, orderBy: { createdAt: 'asc' } });
  res.json(await toDtos(rows));
});

familyRouter.post('/patients/:patientId/family', requireAuth, requireUser, requirePatientAccess('upload'), async (req, res) => {
  const data = parse(body, req.body);
  const patientId = req.access!.patientId;
  await assertPatientMedia(patientId, [data.photoMediaId], 'PHOTO');
  await assertPatientMedia(patientId, [data.voiceMediaId], 'VOICE');
  const count = await prisma.familyMember.count({ where: { patientId } });
  const f = await prisma.familyMember.create({ data: { ...data, hue: data.hue ?? HUES[count % HUES.length], patientId } });
  await audit('family.created', { actorId: req.auth!.sub, patientId, meta: { familyId: f.id } });
  res.status(201).json((await toDtos([f]))[0]);
});

familyRouter.patch('/patients/:patientId/family/:familyId', requireAuth, requireUser, requirePatientAccess('upload'), async (req, res) => {
  const data = parse(body.partial(), req.body);
  const patientId = req.access!.patientId;
  const existing = await prisma.familyMember.findFirst({ where: { id: String(req.params.familyId), patientId } });
  if (!existing) throw notFound('Family member');
  await assertPatientMedia(patientId, [data.photoMediaId], 'PHOTO');
  await assertPatientMedia(patientId, [data.voiceMediaId], 'VOICE');
  const f = await prisma.familyMember.update({ where: { id: existing.id }, data });
  await audit('family.updated', { actorId: req.auth!.sub, patientId, meta: { familyId: f.id } });
  res.json((await toDtos([f]))[0]);
});

familyRouter.delete('/patients/:patientId/family/:familyId', requireAuth, requireUser, requirePatientAccess('delete'), async (req, res) => {
  const patientId = req.access!.patientId;
  const { count } = await prisma.familyMember.deleteMany({ where: { id: String(req.params.familyId), patientId } });
  if (!count) throw notFound('Family member');
  await audit('family.deleted', { actorId: req.auth!.sub, patientId, meta: { familyId: String(req.params.familyId) } });
  res.status(204).end();
});
