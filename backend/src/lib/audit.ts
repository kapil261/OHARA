import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

/** Best-effort audit trail; never blocks the request it records. */
export async function audit(action: string, opts: { actorId?: string | null; patientId?: string | null; meta?: Prisma.InputJsonValue } = {}) {
  try {
    await prisma.auditLog.create({
      data: { action, actorId: opts.actorId ?? null, patientId: opts.patientId ?? null, meta: opts.meta },
    });
  } catch (err) {
    console.error('[audit] failed to record', action, err);
  }
}
