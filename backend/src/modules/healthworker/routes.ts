import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole, requireUser } from '../../middleware/auth.js';
import { addDays, localDate, relativeLabel } from '../../utils/time.js';

export const healthWorkerRouter = Router();

type Status = 'attention' | 'watch' | 'stable';

/**
 * Patients this health worker is on the care team of, in the frontend `HwPatient` shape.
 * attention = open critical/decline alert or 2+ missed doses this week; watch = adherence < 80% or open warning.
 */
healthWorkerRouter.get('/health-worker/patients', requireAuth, requireUser, requireRole('HEALTH_WORKER'), async (req, res) => {
  const now = new Date();
  const where = req.auth!.role === 'ADMIN' ? { deletedAt: null } : { deletedAt: null, team: { some: { userId: req.auth!.sub } } };
  const patients = await prisma.patient.findMany({
    where,
    include: {
      team: { where: { isOwner: true }, include: { user: { select: { name: true, email: true } } } },
      devices: { where: { revokedAt: null }, select: { lastSeenAt: true } },
    },
    orderBy: { displayName: 'asc' },
  });

  const out = await Promise.all(
    patients.map(async (p) => {
      const today = localDate(now, p.timezone);
      const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
      const [occ, openAlerts, lastSession] = await Promise.all([
        prisma.reminderOccurrence.findMany({ where: { patientId: p.id, date: { in: days }, dueAt: { lte: now } }, select: { date: true, status: true } }),
        prisma.alert.findMany({ where: { patientId: p.id, acknowledged: false, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, orderBy: { createdAt: 'desc' } }),
        prisma.gameSession.findFirst({ where: { patientId: p.id }, orderBy: { playedAt: 'desc' }, select: { playedAt: true } }),
      ]);
      const done = occ.filter((o) => o.status === 'DONE').length;
      const missed = occ.filter((o) => o.status === 'MISSED').length;
      const adherence = occ.length ? done / occ.length : 1;
      const trend = days.map((d) => {
        const dd = occ.filter((o) => o.date === d);
        return dd.length ? Math.round((dd.filter((o) => o.status === 'DONE').length / dd.length) * 100) / 100 : 1;
      });

      const critical = openAlerts.find((a) => a.severity === 'CRITICAL' || a.type === 'DECLINE');
      const warn = openAlerts.find((a) => a.severity === 'WARN');
      let status: Status = 'stable';
      let reason = 'Doing well';
      if (critical) {
        status = 'attention';
        reason = critical.title;
      } else if (missed >= 2) {
        status = 'attention';
        reason = `${missed} reminders missed this week`;
      } else if (adherence < 0.8 || warn) {
        status = 'watch';
        reason = warn ? warn.title : `Adherence ${Math.round(adherence * 100)}%`;
      }

      const seen = [lastSession?.playedAt, ...p.devices.map((d) => d.lastSeenAt)].filter((d): d is Date => Boolean(d));
      const lastSeenAt = seen.length ? new Date(Math.max(...seen.map((d) => d.getTime()))) : null;
      const owner = p.team[0]?.user;
      return {
        id: p.id,
        name: p.fullName ?? p.displayName,
        age: p.age,
        village: p.place ?? '',
        status,
        reason,
        lastSeen: relativeLabel(lastSeenAt, now, p.timezone),
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
        adherence: Math.round(adherence * 100) / 100,
        trend,
        caregiver: owner ? owner.name ?? owner.email.split('@')[0] : '',
        openAlerts: openAlerts.length,
      };
    }),
  );
  const rank: Record<Status, number> = { attention: 0, watch: 1, stable: 2 };
  out.sort((a, b) => rank[a.status] - rank[b.status]);
  res.json(out);
});
