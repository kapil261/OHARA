import { Router, type Request, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { pushTo } from '../../integrations/webpush.js';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth, requireRole, requireUser } from '../../middleware/auth.js';
import { median } from '../../utils/baseline.js';
import { userLabel } from '../../utils/contact.js';
import { forbidden, notFound } from '../../utils/errors.js';
import { compareWithBaseline, sessionScore } from '../../utils/scores.js';
import { addDays, localDate, relativeLabel } from '../../utils/time.js';
import { notifiableTeam } from '../common.js';

export const healthWorkerRouter = Router();

type Status = 'attention' | 'watch' | 'stable';
type Flag = 'decline' | 'offline' | 'missed_dose';

const TREND_DAYS = 30;

const listQuery = z.object({
  flagged: z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .optional(),
  village: z.string().trim().max(80).optional(),
  q: z.string().trim().max(80).optional(),
});

/**
 * Patients this health worker is on the care team of, in the frontend `HwPatient` shape, plus a 30-day
 * memory-trend sparkline and flags. attention = open critical/decline alert, below baseline, or 2+ missed
 * doses this week; watch = adherence < 80%, open warning, or phone offline.
 * Filters: ?flagged=true, ?village=Boko, ?q=<name or village>.
 */
healthWorkerRouter.get('/health-worker/patients', requireAuth, requireUser, requireRole('HEALTH_WORKER'), async (req, res) => {
  const f = parse(listQuery, req.query);
  const now = new Date();
  const where: Prisma.PatientWhereInput = {
    deletedAt: null,
    ...(req.auth!.role === 'ADMIN' ? {} : { team: { some: { userId: req.auth!.sub } } }),
    ...(f.village ? { place: { equals: f.village, mode: 'insensitive' } } : {}),
    ...(f.q
      ? {
          OR: [
            { displayName: { contains: f.q, mode: 'insensitive' } },
            { fullName: { contains: f.q, mode: 'insensitive' } },
            { place: { contains: f.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const patients = await prisma.patient.findMany({
    where,
    include: {
      team: { where: { isOwner: true }, include: { user: { select: { name: true, email: true, phone: true } } } },
      devices: { where: { revokedAt: null }, select: { lastSeenAt: true, createdAt: true } },
    },
    orderBy: { displayName: 'asc' },
  });

  const out = await Promise.all(
    patients.map(async (p) => {
      const today = localDate(now, p.timezone);
      const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
      const trendDays = Array.from({ length: TREND_DAYS }, (_, i) => addDays(today, i - (TREND_DAYS - 1)));
      const [occ, openAlerts, sessions] = await Promise.all([
        prisma.reminderOccurrence.findMany({ where: { patientId: p.id, date: { in: days }, dueAt: { lte: now } }, select: { date: true, status: true } }),
        prisma.alert.findMany({ where: { patientId: p.id, acknowledged: false, resolved: false, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, orderBy: { createdAt: 'desc' } }),
        prisma.gameSession.findMany({ where: { patientId: p.id, playedAt: { gte: new Date(now.getTime() - 90 * 86_400_000) } }, orderBy: { playedAt: 'desc' } }),
      ]);
      const done = occ.filter((o) => o.status === 'DONE').length;
      const missed = occ.filter((o) => o.status === 'MISSED').length;
      const adherence = occ.length ? done / occ.length : 1;
      const trend = days.map((d) => {
        const dd = occ.filter((o) => o.date === d);
        return dd.length ? Math.round((dd.filter((o) => o.status === 'DONE').length / dd.length) * 100) / 100 : 1;
      });

      // 30-day memory trend vs the patient's own earlier baseline.
      const recent = sessions.filter((s) => trendDays.includes(localDate(s.playedAt, p.timezone)));
      const earlier = sessions.filter((s) => localDate(s.playedAt, p.timezone) < trendDays[0]);
      const memory = compareWithBaseline(recent.map(sessionScore), earlier.map(sessionScore));
      const memoryTrend = trendDays.map((d) => {
        const day = recent.filter((s) => localDate(s.playedAt, p.timezone) === d);
        return day.length ? Math.round(median(day.map(sessionScore))) : null;
      });
      const belowBaseline = memory.trend === 'watch';

      const seen = [sessions[0]?.playedAt, ...p.devices.map((d) => d.lastSeenAt)].filter((d): d is Date => Boolean(d));
      const lastSeenAt = seen.length ? new Date(Math.max(...seen.map((d) => d.getTime()))) : null;
      const silentMs = env.DEVICE_SILENT_HOURS * 3_600_000;
      const offline = p.devices.length > 0 && (!lastSeenAt || now.getTime() - lastSeenAt.getTime() > silentMs);

      const flags: Flag[] = [];
      if (belowBaseline || openAlerts.some((a) => a.type === 'DECLINE')) flags.push('decline');
      if (offline || openAlerts.some((a) => a.type === 'INACTIVITY')) flags.push('offline');
      if (missed > 0 || openAlerts.some((a) => a.type === 'MISSED_DOSE')) flags.push('missed_dose');

      const critical = openAlerts.find((a) => a.severity === 'CRITICAL' || a.type === 'DECLINE');
      const warn = openAlerts.find((a) => a.severity === 'WARN');
      let status: Status = 'stable';
      let reason = 'Doing well';
      if (critical) {
        status = 'attention';
        reason = critical.title;
      } else if (belowBaseline) {
        status = 'attention';
        reason = 'Game scores below usual level';
      } else if (missed >= 2) {
        status = 'attention';
        reason = `${missed} reminders missed this week`;
      } else if (adherence < 0.8 || warn || offline) {
        status = 'watch';
        reason = warn ? warn.title : offline ? 'Phone offline' : `Adherence ${Math.round(adherence * 100)}%`;
      }

      const owner = p.team[0]?.user;
      return {
        id: p.id,
        name: p.fullName ?? p.displayName,
        age: p.age,
        village: p.place ?? '',
        status,
        reason,
        flags,
        lastSeen: relativeLabel(lastSeenAt, now, p.timezone),
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
        adherence: Math.round(adherence * 100) / 100,
        trend,
        memoryTrend,
        memoryScore: memory.score,
        memoryBaseline: memory.baseline,
        belowBaseline,
        caregiver: owner ? userLabel(owner) : '',
        openAlerts: openAlerts.length,
      };
    }),
  );
  const rank: Record<Status, number> = { attention: 0, watch: 1, stable: 2 };
  const list = f.flagged ? out.filter((p) => p.flags.length > 0) : out;
  list.sort((a, b) => rank[a.status] - rank[b.status]);
  res.json(list);
});

// ---------- Visit notes ----------

const noteDto = (n: Prisma.VisitNoteGetPayload<{ include: { author: { select: { name: true; email: true; phone: true } } } }>) => ({
  id: n.id,
  patientId: n.patientId,
  text: n.text,
  author: n.author ? userLabel(n.author) : 'Former team member',
  authorId: n.authorId,
  visitedAt: n.visitedAt.toISOString(),
  createdAt: n.createdAt.toISOString(),
});
const withAuthor = { author: { select: { name: true, email: true, phone: true } } } as const;

/** Visit notes are visible to everyone on the care team (family included). */
healthWorkerRouter.get('/patients/:patientId/notes', requireAuth, requireUser, requirePatientAccess('view'), async (req, res) => {
  const rows = await prisma.visitNote.findMany({ where: { patientId: req.access!.patientId }, include: withAuthor, orderBy: { visitedAt: 'desc' }, take: 100 });
  res.json(rows.map(noteDto));
});

const noteBody = z.object({ text: z.string().trim().min(1).max(2000), visitedAt: z.coerce.date().optional() });

/** A health worker (or admin) adds a short note after a home visit; the family gets a push. */
async function addNote(req: Request, res: Response) {
  const body = parse(noteBody, req.body);
  const patientId = req.access!.patientId;
  const member = await prisma.careTeamMember.findUnique({ where: { patientId_userId: { patientId, userId: req.auth!.sub } }, select: { memberRole: true } });
  const isHw = req.auth!.role === 'ADMIN' || req.auth!.role === 'HEALTH_WORKER' || member?.memberRole === 'HEALTH_WORKER';
  if (!isHw) throw forbidden('Only health workers can add visit notes');
  const visitedAt = body.visitedAt && body.visitedAt.getTime() <= Date.now() + 60_000 ? body.visitedAt : new Date();
  const note = await prisma.visitNote.create({ data: { patientId, authorId: req.auth!.sub, text: body.text, visitedAt }, include: withAuthor });
  await audit('visit_note.created', { actorId: req.auth!.sub, patientId, meta: { noteId: note.id } });
  const team = await notifiableTeam(patientId);
  await pushTo(
    { userIds: team.userIds.filter((id) => id !== req.auth!.sub) },
    { title: 'New visit note', body: body.text.slice(0, 120), tag: `note-${note.id}`, url: `${env.APP_URL.replace(/\/$/, '')}/caregiver` },
  );
  res.status(201).json(noteDto(note));
}

// `/hw/patients/:id/notes` is the path used in the design docs; both work.
healthWorkerRouter.post('/patients/:patientId/notes', requireAuth, requireUser, requirePatientAccess('view'), addNote);
healthWorkerRouter.post('/hw/patients/:patientId/notes', requireAuth, requireUser, requirePatientAccess('view'), addNote);

healthWorkerRouter.delete('/patients/:patientId/notes/:noteId', requireAuth, requireUser, requirePatientAccess('view'), async (req, res) => {
  const patientId = req.access!.patientId;
  const note = await prisma.visitNote.findFirst({ where: { id: String(req.params.noteId), patientId } });
  if (!note) throw notFound('Visit note');
  if (note.authorId !== req.auth!.sub && req.auth!.role !== 'ADMIN') throw forbidden('Only the author can delete this note');
  await prisma.visitNote.delete({ where: { id: note.id } });
  await audit('visit_note.deleted', { actorId: req.auth!.sub, patientId, meta: { noteId: note.id } });
  res.status(204).end();
});
