import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { raiseAlert } from '../modules/alerts/service.js';
import { relativeLabel } from '../utils/time.js';

/**
 * Hourly: flag paired phones that have not contacted the server for DEVICE_SILENT_HOURS.
 * At most one open "phone offline" alert per device; a new one only after the old one is resolved
 * or another full silent period has passed.
 */
export async function deviceSilentTick(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.DEVICE_SILENT_HOURS * 3_600_000);
  const silent = await prisma.device.findMany({
    where: {
      revokedAt: null,
      patient: { deletedAt: null },
      OR: [{ lastSeenAt: { lte: cutoff } }, { lastSeenAt: null, createdAt: { lte: cutoff } }],
    },
    include: { patient: { select: { displayName: true, timezone: true } } },
  });
  let raised = 0;
  for (const d of silent) {
    const recent = await prisma.alert.findFirst({
      where: { deviceId: d.id, type: 'INACTIVITY', OR: [{ resolved: false }, { createdAt: { gte: cutoff } }] },
      select: { id: true },
    });
    if (recent) continue;
    const days = Math.floor((now.getTime() - (d.lastSeenAt ?? d.createdAt).getTime()) / 86_400_000);
    await raiseAlert({
      patientId: d.patientId,
      type: 'INACTIVITY',
      severity: 'WARN',
      title: `Phone offline for ${days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : `${env.DEVICE_SILENT_HOURS} hours`}`,
      detail: `${d.patient.displayName}'s phone (${d.label ?? 'patient device'}) was last seen ${relativeLabel(d.lastSeenAt, now, d.patient.timezone).toLowerCase()}. It may be switched off, out of charge or out of network.`,
      deviceId: d.id,
    });
    raised++;
  }
  return { silent: silent.length, raised };
}
