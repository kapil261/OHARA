import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { requireConsent } from '../../lib/consent.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth } from '../../middleware/auth.js';
import { notFound } from '../../utils/errors.js';
import { median } from '../../utils/baseline.js';
import { compareWithBaseline, DOMAINS, GAME_DOMAIN, sessionScore } from '../../utils/scores.js';
import { addDays, localDate, weekdayOf } from '../../utils/time.js';
import { sessionDto } from '../games/service.js';

export const progressRouter = Router();

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_ACTIVITY_BASELINE = 16;
// Personal baseline = sessions from this many days before the selected range.
const BASELINE_LOOKBACK_DAYS = 60;

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

/**
 * Progress for the caregiver screen: the weekly view (activity, adherence, recent sessions) plus,
 * for the chosen range, domain scores vs personal baseline, a daily score line and reminder compliance.
 */
export async function progressFor(patientId: string, now = new Date(), range: RangeDays = 7) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw notFound('Patient');
  const tz = patient.timezone;
  const today = localDate(now, tz);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const rangeDays = Array.from({ length: range }, (_, i) => addDays(today, i - (range - 1)));
  const rangeStart = new Date(now.getTime() - (range + 1) * 86_400_000);
  const baselineStart = new Date(rangeStart.getTime() - BASELINE_LOOKBACK_DAYS * 86_400_000);

  const all = await prisma.gameSession.findMany({ where: { patientId, playedAt: { gte: baselineStart } }, orderBy: { playedAt: 'desc' } });
  const inRange = all.filter((s) => rangeDays.includes(localDate(s.playedAt, tz)));
  const earlier = all.filter((s) => localDate(s.playedAt, tz) < rangeDays[0]);

  // --- Weekly view (unchanged shape) ---
  const minutesByDay = new Map<string, number>();
  for (const s of all) {
    const d = localDate(s.playedAt, tz);
    minutesByDay.set(d, (minutesByDay.get(d) ?? 0) + s.durationMs / 60_000);
  }
  const weekActivity = week.map((d) => ({ date: d, day: DAY_NAMES[weekdayOf(d)], minutes: Math.round(minutesByDay.get(d) ?? 0) }));
  const activity = await prisma.baseline.findUnique({ where: { patientId_metric: { patientId, metric: 'activityMinutes' } } });
  const activityBaseline = activity ? Math.round(activity.median) : DEFAULT_ACTIVITY_BASELINE;

  const occ = await prisma.reminderOccurrence.findMany({
    where: { patientId, date: { in: rangeDays } },
    select: { date: true, status: true, dueAt: true },
  });
  const dueAll = occ.filter((o) => o.dueAt <= now);
  const dueWeek = dueAll.filter((o) => week.includes(o.date));
  const done = dueWeek.filter((o) => o.status === 'DONE').length;
  const missed = dueWeek.filter((o) => o.status === 'MISSED').length;
  const adherenceByDay = week.map((d) => {
    const dd = dueWeek.filter((o) => o.date === d);
    return { date: d, day: DAY_NAMES[weekdayOf(d)], due: dd.length, done: dd.filter((o) => o.status === 'DONE').length };
  });

  // --- Domain scores vs personal baseline ---
  const scoresOf = (rows: typeof all, domain: string) => rows.filter((s) => GAME_DOMAIN[s.gameId] === domain).map(sessionScore);
  const domains = DOMAINS.map((domain) => ({
    domain,
    sessions: scoresOf(inRange, domain).length,
    ...compareWithBaseline(scoresOf(inRange, domain), scoresOf(earlier, domain)),
  }));
  const overall = compareWithBaseline(inRange.map(sessionScore), earlier.map(sessionScore));

  // --- Daily line (dashed baseline drawn from overall.baseline) and compliance ---
  const daily = rangeDays.map((d) => {
    const day = inRange.filter((s) => localDate(s.playedAt, tz) === d);
    const dueDay = dueAll.filter((o) => o.date === d);
    const doneDay = dueDay.filter((o) => o.status === 'DONE').length;
    return {
      date: d,
      score: day.length ? Math.round(median(day.map(sessionScore))) : null,
      sessions: day.length,
      minutes: Math.round(minutesByDay.get(d) ?? 0),
      remindersDue: dueDay.length,
      remindersDone: doneDay,
      compliance: dueDay.length ? Math.round((doneDay / dueDay.length) * 100) / 100 : null,
    };
  });
  const rangeDone = dueAll.filter((o) => o.status === 'DONE').length;

  return {
    patientId,
    timezone: tz,
    weekActivity,
    activityBaseline,
    totalMinutes: weekActivity.reduce((a, w) => a + w.minutes, 0),
    adherence: dueWeek.length ? done / dueWeek.length : null,
    remindersDue: dueWeek.length,
    remindersDone: done,
    remindersMissed: missed,
    adherenceByDay,
    recentSessions: all.slice(0, 20).map(sessionDto),
    range,
    overall,
    domains,
    daily,
    compliance: dueAll.length ? rangeDone / dueAll.length : null,
    disclaimer: 'Scores are support signals compared only with this person’s own usual level. They are not a diagnosis; please discuss changes with a doctor.',
  };
}

const rangeQuery = z.object({
  range: z.coerce
    .number()
    .refine((n): n is RangeDays => (RANGES as readonly number[]).includes(n), 'range must be 7, 30 or 90')
    .default(7),
});

progressRouter.get('/patients/:patientId/progress', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const q = parse(rangeQuery, req.query);
  await requireConsent(req.access!.patientId, 'analytics');
  res.json(await progressFor(req.access!.patientId, new Date(), q.range as RangeDays));
});

const DOMAIN_LABEL: Record<string, string> = { memory: 'Memory', attention: 'Attention', recognition: 'Recognition', routine: 'Routine' };

/** One-page weekly report for doctor visits. `/reports/weekly` is the path used in the design docs. */
progressRouter.get(['/patients/:patientId/report.pdf', '/patients/:patientId/reports/weekly'], requireAuth, requirePatientAccess('export'), async (req, res) => {
  const patientId = req.access!.patientId;
  await requireConsent(patientId, 'analytics');
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw notFound('Patient');
  const p = await progressFor(patientId);
  const alerts = await prisma.alert.findMany({ where: { patientId, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, orderBy: { createdAt: 'desc' }, take: 15 });
  const notes = await prisma.visitNote.findMany({ where: { patientId, visitedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, orderBy: { visitedAt: 'desc' }, take: 5 });
  await audit('report.exported', { actorId: req.auth!.sub, patientId });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ohara-report-${localDate(new Date(), patient.timezone)}.pdf"`);
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.fontSize(20).text('OHARA weekly care report');
  doc.moveDown(0.3).fontSize(10).fillColor('#555').text(`Generated ${new Date().toLocaleString('en-IN', { timeZone: patient.timezone })} (${patient.timezone})`);
  doc.moveDown().fillColor('#000').fontSize(13).text(patient.fullName ?? patient.displayName);
  doc.fontSize(10).text([patient.age ? `Age ${patient.age}` : null, patient.place, patient.language].filter(Boolean).join(' · '));

  doc.moveDown().fontSize(13).text('Brain-game scores vs personal baseline (last 7 days)');
  doc.fontSize(10);
  for (const d of p.domains) {
    const score = d.score === null ? 'not played' : `${d.score}`;
    const base = d.baseline === null ? '' : ` (usual ${d.baseline})`;
    doc.text(`  ${DOMAIN_LABEL[d.domain]}: ${score}${base} — ${d.trend}`);
  }

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

  if (notes.length) {
    doc.moveDown().fontSize(13).text('Health worker visit notes');
    doc.fontSize(10);
    for (const n of notes) doc.text(`  ${n.visitedAt.toLocaleDateString('en-IN', { timeZone: patient.timezone })}: ${n.text}`);
  }

  doc.moveDown(2).fontSize(8).fillColor('#777').text(p.disclaimer);
  doc.end();
});
