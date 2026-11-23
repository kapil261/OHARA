import type { Alert, Baseline, MediaItem, Patient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { deliveryUrl, type ResourceType } from '../integrations/cloudinary.js';

/** Signed delivery URL for a stored media item. */
export const urlForMedia = (m: Pick<MediaItem, 'publicId' | 'resourceType' | 'format'>) =>
  deliveryUrl(m.publicId, m.resourceType as ResourceType, m.format);

/** Resolve many media ids to signed URLs in one query. */
export async function mediaUrlMap(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const items = await prisma.mediaItem.findMany({ where: { id: { in: unique } } });
  for (const m of items) {
    const url = urlForMedia(m);
    if (url) map.set(m.id, url);
  }
  return map;
}

/** Patient DTO matching frontend `Patient` (+ demo fields fullName/age/place). */
export async function patientDto(p: Patient, baselines?: Baseline[]) {
  const urls = await mediaUrlMap([p.photoMediaId, p.voiceMediaId]);
  const bl = baselines ?? (await prisma.baseline.findMany({ where: { patientId: p.id } }));
  const acc = bl.find((b) => b.metric === 'accuracy');
  const rt = bl.find((b) => b.metric === 'responseTimeMs');
  return {
    id: p.id,
    displayName: p.displayName,
    fullName: p.fullName ?? p.displayName,
    age: p.age,
    place: p.place ?? '',
    language: p.language,
    timezone: p.timezone,
    baseline:
      acc && rt
        ? { accuracy: acc.median, responseTimeMs: Math.round(rt.median), computedAt: acc.computedAt.toISOString() }
        : undefined,
    photoUrl: p.photoMediaId ? urls.get(p.photoMediaId) : undefined,
    voiceClipUrl: p.voiceMediaId ? urls.get(p.voiceMediaId) : undefined,
  };
}

const ALERT_TYPE = { DECLINE: 'decline', MISSED_DOSE: 'missed_dose', SOS: 'sos', INACTIVITY: 'inactivity', INFO: 'info' } as const;

/** Alert DTO: frontend `Alert` fields plus demo `CareAlert` fields (level/title/detail/time). */
export function alertDto(a: Alert, timeZone = 'Asia/Kolkata') {
  const severity = a.severity.toLowerCase() as 'info' | 'warn' | 'critical';
  return {
    id: a.id,
    patientId: a.patientId,
    type: ALERT_TYPE[a.type],
    severity,
    level: severity === 'critical' ? 'urgent' : severity,
    title: a.title,
    detail: a.detail,
    message: a.detail ? `${a.title}. ${a.detail}` : a.title,
    acknowledged: a.acknowledged,
    acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    time: a.createdAt.toLocaleTimeString('en-IN', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

/** Care-team members who want notifications (for email + push escalation). */
export async function notifiableTeam(patientId: string) {
  const members = await prisma.careTeamMember.findMany({
    where: { patientId },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return {
    userIds: members.map((m) => m.userId),
    emails: members.filter((m) => m.notifyEmail).map((m) => m.user.email),
  };
}
