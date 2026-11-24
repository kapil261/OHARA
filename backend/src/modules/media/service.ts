import type { MediaKind } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { badRequest } from '../../utils/errors.js';

/** Cloudinary stores audio under the "video" resource type. */
export const resourceTypeFor = (kind: MediaKind) => (kind === 'VOICE' ? 'video' : 'image') as 'image' | 'video';

/** Throws unless every given media id belongs to this patient (and, optionally, is of `kind`). */
export async function assertPatientMedia(patientId: string, ids: (string | null | undefined)[], kind?: MediaKind) {
  const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!wanted.length) return;
  const n = await prisma.mediaItem.count({ where: { id: { in: wanted }, patientId, ...(kind ? { kind } : {}) } });
  if (n !== wanted.length) throw badRequest('Media does not belong to this patient');
}
