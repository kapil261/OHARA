import { Router } from 'express';
import { z } from 'zod';
import { MediaKind } from '@prisma/client';
import { destroyResource, fetchResource, patientFolder, signUpload } from '../../integrations/cloudinary.js';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth, requireUser } from '../../middleware/auth.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { urlForMedia } from '../common.js';
import { resourceTypeFor } from './service.js';

/**
 * Media flow (Cloudinary free tier, direct browser upload):
 * 1. POST /patients/:id/media/sign { kind } -> { uploadUrl, fields }
 * 2. Browser POSTs the file + fields straight to Cloudinary (the API never handles the bytes).
 * 3. POST /patients/:id/media { kind, publicId, label?, personName? } -> verified with Cloudinary and stored.
 */
export const mediaRouter = Router();

const kind = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.nativeEnum(MediaKind));

type MediaRow = Awaited<ReturnType<typeof prisma.mediaItem.findFirstOrThrow>>;
type Usage = { reminders: number; family: number; profile: boolean };

const mediaDto = (m: MediaRow, usedIn?: Usage) => ({
  id: m.id,
  kind: m.kind.toLowerCase(),
  label: m.label,
  personName: m.personName,
  purpose: m.purpose,
  ...(usedIn ? { usedIn } : {}),
  format: m.format,
  bytes: m.bytes,
  url: urlForMedia(m),
  createdAt: m.createdAt.toISOString(),
});

mediaRouter.post('/patients/:patientId/media/sign', requireAuth, requireUser, requirePatientAccess('upload'), async (req, res) => {
  const body = parse(z.object({ kind }), req.body);
  res.json(signUpload(req.access!.patientId, resourceTypeFor(body.kind)));
});

// "praise" clips play after a game; "greeting" on the family album; "reminder" for reminder voices.
const purpose = z.string().trim().max(30);

const registerBody = z.object({
  kind,
  publicId: z.string().min(1).max(255),
  label: z.string().trim().max(80).optional(),
  personName: z.string().trim().max(60).optional(),
  purpose: purpose.optional(),
});

/** Where each media item is used (shown next to voice clips: "Used in 2 reminders"). */
async function usageFor(patientId: string, ids: string[]): Promise<Map<string, Usage>> {
  const [reminders, family, patient] = await Promise.all([
    prisma.reminder.findMany({ where: { patientId, OR: [{ voiceMediaId: { in: ids } }, { photoMediaId: { in: ids } }] }, select: { voiceMediaId: true, photoMediaId: true } }),
    prisma.familyMember.findMany({ where: { patientId, OR: [{ voiceMediaId: { in: ids } }, { photoMediaId: { in: ids } }] }, select: { voiceMediaId: true, photoMediaId: true } }),
    prisma.patient.findUnique({ where: { id: patientId }, select: { photoMediaId: true, voiceMediaId: true } }),
  ]);
  const map = new Map<string, Usage>(ids.map((id) => [id, { reminders: 0, family: 0, profile: false }]));
  for (const r of reminders) for (const id of [r.voiceMediaId, r.photoMediaId]) if (id && map.has(id)) map.get(id)!.reminders++;
  for (const f of family) for (const id of [f.voiceMediaId, f.photoMediaId]) if (id && map.has(id)) map.get(id)!.family++;
  for (const id of [patient?.photoMediaId, patient?.voiceMediaId]) if (id && map.has(id)) map.get(id)!.profile = true;
  return map;
}

mediaRouter.post('/patients/:patientId/media', requireAuth, requireUser, requirePatientAccess('upload'), async (req, res) => {
  const body = parse(registerBody, req.body);
  const patientId = req.access!.patientId;
  // Only accept assets inside this patient's folder, so nobody can register someone else's upload.
  if (!body.publicId.startsWith(`${patientFolder(patientId)}/`)) throw badRequest('Upload is not in this patient folder');
  const rt = resourceTypeFor(body.kind);
  const info = await fetchResource(body.publicId, rt);
  if (await prisma.mediaItem.findUnique({ where: { publicId: info.publicId } })) throw conflict('This upload is already registered');
  const m = await prisma.mediaItem.create({
    data: {
      patientId,
      kind: body.kind,
      publicId: info.publicId,
      resourceType: rt,
      format: info.format,
      bytes: info.bytes,
      label: body.label,
      personName: body.personName,
      purpose: body.purpose,
      uploadedBy: req.auth!.sub,
    },
  });
  await audit('media.uploaded', { actorId: req.auth!.sub, patientId, meta: { mediaId: m.id, kind: m.kind } });
  res.status(201).json(mediaDto(m));
});

mediaRouter.get('/patients/:patientId/media', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const k = req.query.kind ? parse(kind, req.query.kind) : undefined;
  const p = req.query.purpose ? parse(purpose, req.query.purpose) : undefined;
  const patientId = req.access!.patientId;
  const items = await prisma.mediaItem.findMany({
    where: { patientId, ...(k ? { kind: k } : {}), ...(p ? { purpose: p } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  const usage = await usageFor(patientId, items.map((m) => m.id));
  res.json(items.map((m) => mediaDto(m, usage.get(m.id))));
});

/** Rename a clip or photo, or change who is in it / what it is for. */
mediaRouter.patch('/patients/:patientId/media/:mediaId', requireAuth, requireUser, requirePatientAccess('upload'), async (req, res) => {
  const body = parse(
    z.object({ label: z.string().trim().max(80).nullable().optional(), personName: z.string().trim().max(60).nullable().optional(), purpose: purpose.nullable().optional() }),
    req.body,
  );
  const patientId = req.access!.patientId;
  const existing = await prisma.mediaItem.findFirst({ where: { id: String(req.params.mediaId), patientId } });
  if (!existing) throw notFound('Media');
  const m = await prisma.mediaItem.update({ where: { id: existing.id }, data: body });
  await audit('media.updated', { actorId: req.auth!.sub, patientId, meta: { mediaId: m.id, fields: Object.keys(body) } });
  const usage = await usageFor(patientId, [m.id]);
  res.json(mediaDto(m, usage.get(m.id)));
});

mediaRouter.delete('/patients/:patientId/media/:mediaId', requireAuth, requireUser, requirePatientAccess('delete'), async (req, res) => {
  const patientId = req.access!.patientId;
  const m = await prisma.mediaItem.findFirst({ where: { id: String(req.params.mediaId), patientId } });
  if (!m) throw notFound('Media');
  // Detach references first so nothing points at a deleted asset.
  await prisma.$transaction([
    prisma.patient.updateMany({ where: { id: patientId, photoMediaId: m.id }, data: { photoMediaId: null } }),
    prisma.patient.updateMany({ where: { id: patientId, voiceMediaId: m.id }, data: { voiceMediaId: null } }),
    prisma.reminder.updateMany({ where: { patientId, voiceMediaId: m.id }, data: { voiceMediaId: null } }),
    prisma.reminder.updateMany({ where: { patientId, photoMediaId: m.id }, data: { photoMediaId: null } }),
    prisma.familyMember.updateMany({ where: { patientId, photoMediaId: m.id }, data: { photoMediaId: null } }),
    prisma.familyMember.updateMany({ where: { patientId, voiceMediaId: m.id }, data: { voiceMediaId: null } }),
    prisma.mediaItem.delete({ where: { id: m.id } }),
  ]);
  await destroyResource(m.publicId, m.resourceType as 'image' | 'video');
  await audit('media.deleted', { actorId: req.auth!.sub, patientId, meta: { mediaId: m.id } });
  res.status(204).end();
});
