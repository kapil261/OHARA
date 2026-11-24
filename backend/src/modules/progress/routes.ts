import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth } from '../../middleware/auth.js';
import { notFound } from '../../utils/errors.js';
import { addDays, localDate, weekdayOf } from '../../utils/time.js';
import { sessionDto } from '../games/service.js';

export const progressRouter = Router();

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_ACTIVITY_BASELINE = 16;

/** Weekly activity, adherence and recent sessions for the caregiver Progress screen. */
export async function progressFor(patientId: string, now = new Date()) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw notFound('Patient');
  const tz = patient.timezone;
  const today = localDate(now, tz);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const since = new Date(now.getTime() - 8 * 86_400_000);

  const sessions = await prisma.gameSession.findMany({ where: { patientId, playedAt: { gte: since } }, orderBy: { playedAt: 'desc' } });
  const minutesByDay = new Map(days.map((d) => [d, 0]));
  for (const s of sessions) {
    const d = localDate(s.playedAt, tz);
    if (minutesByDay.has(d)) minutesByDay.set(d, minutesByDay.get(d)! + s.durationMs / 60_000);
  }
  const weekActivity = days.map((d) => ({ date: d, day: DAY_NAMES[weekdayOf(d)], minutes: Math.round(minutesByDay.get(d)!) }));

  const baseline = await prisma.baseline.findUnique({ where: { patientId_metric: { patientId, metric: 'activityMinutes' } } });
  const activityBaseline = baseline ? Math.round(baseline.median) : DEFAULT_ACTIVITY_BASELINE;

  const occ = await prisma.reminderOccurrence.findMany({ where: { patientId, date: { in: days } }, select: { date: true, status: true, dueAt: true } });
  const due = occ.filter((o) => o.dueAt <= now);
  const done = due.filter((o) => o.status === 'DONE').length;
  const missed = due.filter((o) => o.status === 'MISSED').length;
  const adherence = due.length ? done / due.length : null;
  const adherenceByDay = days.map((d) => {
    const dd = due.filter((o) => o.date === d);
    return { date: d, day: DAY_NAMES[weekdayOf(d)], due: dd.length, done: dd.filter((o) => o.status === 'DONE').length };
  });

  const totalMinutes = weekActivity.reduce((a, w) => a + w.minutes, 0);
  return {
    patientId,
    timezone: tz,
    weekActivity,
    activityBaseline,
    totalMinutes,
    adherence,
    remindersDue: due.length,
    remindersDone: done,
    remindersMissed: missed,
    adherenceByDay,
    recentSessions: sessions.slice(0, 20).map(sessionDto),
  };
}

progressRouter.get('/patients/:patientId/progress', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  res.json(await progressFor(req.access!.patientId));
});

/** Printable weekly report for doctor visits. */
progressRouter.get('/patients/:patientId/report.pdf', requireAuth, requirePatientAccess('export'), async (req, res) => {
  const patientId = req.access!.patientId;
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw notFound('Patient');
  const p = await progressFor(patientId);
  const alerts = await prisma.alert.findMany({ where: { patientId, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, orderBy: { createdAt: 'desc' }, take: 15 });
  await audit('report.exported', { actorId: req.auth!.sub, patientId });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ohara-report-${localDate(new Date(), patient.timezone)}.pdf"`);
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.fontSize(20).text('OHARA weekly care report');
  doc.moveDown(0.3).fontSize(10).fillColor('#555').text(`Generated ${new Date().toLocaleString('en-IN', { timeZone: patient.timezone })} (${patient.timezone})`);
  doc.moveDown().fillColor('#000').fontSize(13).text(patient.fullName ?? patient.displayName);
  doc.fontSize(10).text([patient.age ? `Age ${patient.age}` : null, patient.place, patient.language].filter(Boolean).join(' · '));

  doc.moveDown().fontSize(13).text('Reminders (last 7 days)');
  doc.fontSize(10).text(
    p.adherence === null
      ? 'No reminders were due.'
      : `${p.remindersDone} of ${p.remindersDue} done (${Math.round(p.adherence * 100)}%), ${p.remindersMissed} missed.`,
  );
  for (const d of p.adherenceByDay) doc.text(`  ${d.day} ${d.date}: ${d.done}/${d.due}`);

  doc.moveDown().fontSize(13).text('Brain-game activity');
  doc.fontSize(10).text(`${p.totalMinutes} minutes this week (usual daily level: ${p.activityBaseline} min).`);
  for (const w of p.weekActivity) doc.text(`  ${w.day} ${w.date}: ${w.minutes} min`);

  doc.moveDown().fontSize(13).text('Recent alerts');
  doc.fontSize(10);
  if (!alerts.length) doc.text('None.');
  for (const a of alerts) doc.text(`  ${a.createdAt.toLocaleString('en-IN', { timeZone: patient.timezone })} [${a.severity}] ${a.title}${a.detail ? ` — ${a.detail}` : ''}`);

  doc.moveDown(2).fontSize(8).fillColor('#777').text('OHARA is a support tool, not a diagnosis. Discuss changes with a doctor.');
  doc.end();
});
