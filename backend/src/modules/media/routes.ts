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

const mediaDto = (m: Awaited<ReturnType<typeof prisma.mediaItem.findFirstOrThrow>>) => ({
  id: m.id,
  kind: m.kind.toLowerCase(),
  label: m.label,
  personName: m.personName,
  format: m.format,
  bytes: m.bytes,
  url: urlForMedia(m),
  createdAt: m.createdAt.toISOString(),
});

mediaRouter.post('/patients/:patientId/media/sign', requireAuth, requireUser, requirePatientAccess('upload'), async (req, res) => {
  const body = parse(z.object({ kind }), req.body);
  res.json(signUpload(req.access!.patientId, resourceTypeFor(body.kind)));
});

const registerBody = z.object({
  kind,
  publicId: z.string().min(1).max(255),
  label: z.string().trim().max(80).optional(),
  personName: z.string().trim().max(60).optional(),
});

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
      uploadedBy: req.auth!.sub,
    },
  });
  await audit('media.uploaded', { actorId: req.auth!.sub, patientId, meta: { mediaId: m.id, kind: m.kind } });
  res.status(201).json(mediaDto(m));
});

mediaRouter.get('/patients/:patientId/media', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const k = req.query.kind ? parse(kind, req.query.kind) : undefined;
  const items = await prisma.mediaItem.findMany({
    where: { patientId: req.access!.patientId, ...(k ? { kind: k } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  res.json(items.map(mediaDto));
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
