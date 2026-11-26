import { env } from '../../config/env.js';
import { destroyResource, type ResourceType } from '../../integrations/cloudinary.js';
import { audit } from '../../lib/audit.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';

export const purgeDateFor = (deletedAt: Date) => new Date(deletedAt.getTime() + env.DELETE_GRACE_DAYS * 86_400_000);

/**
 * Permanently remove patients whose grace period has ended: their media files in Cloudinary first,
 * then the patient row (every related table cascades). Audit rows keep the action but lose the link.
 */
export async function purgeDeletedPatients(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.DELETE_GRACE_DAYS * 86_400_000);
  const due = await prisma.patient.findMany({ where: { deletedAt: { lte: cutoff } }, select: { id: true } });
  for (const p of due) {
    const media = await prisma.mediaItem.findMany({ where: { patientId: p.id }, select: { publicId: true, resourceType: true } });
    for (const m of media) {
      try {
        await destroyResource(m.publicId, m.resourceType as ResourceType);
      } catch (err) {
        // A missing file must not block the purge; the database rows go regardless.
        logger.warn({ err: (err as Error).message }, 'media delete failed during purge');
      }
    }
    await prisma.patient.delete({ where: { id: p.id } });
    await audit('patient.purged', { meta: { patientId: p.id, mediaFiles: media.length } });
  }
  return { purged: due.length };
}
