import { Router } from 'express';
import { z } from 'zod';
import { ReminderKind, type OccurrenceStatus } from '@prisma/client';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth } from '../../middleware/auth.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { buildDaySchedule, reminderStatus, runsOn } from '../../utils/schedule.js';
import { isHHMM, weekdayOf, zonedTimeToUtc } from '../../utils/time.js';
import { mediaUrlMap } from '../common.js';
import { ensureOccurrences, todayFor } from './service.js';

export const remindersRouter = Router();

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const kind = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.nativeEnum(ReminderKind));
const reminderBody = z.object({
  kind,
  time: z.string().refine(isHHMM, 'Use 24h HH:MM'),
  title: z.string().trim().min(1).max(80),
  detail: z.string().trim().max(200).optional(),
  voiceBy: z.string().trim().max(40).optional(),
  voiceMediaId: z.string().nullable().optional(),
  photoMediaId: z.string().nullable().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  active: z.boolean().optional(),
  clientId: z.string().max(64).optional(),
});

async function loadPatient(id: string) {
  return prisma.patient.findUniqueOrThrow({ where: { id } });
}

async function checkMedia(patientId: string, ids: (string | null | undefined)[]) {
  const wanted = ids.filter((x): x is string => Boolean(x));
  if (!wanted.length) return;
  const n = await prisma.mediaItem.count({ where: { id: { in: wanted }, patientId } });
  if (n !== new Set(wanted).size) throw badRequest('Media does not belong to this patient');
}

/** Build one day's schedule in the demo `ScheduleItem` shape. Shared by the schedule route and sync pull. */
export async function daySchedule(patientId: string, dateArg?: string) {
  const patient = await loadPatient(patientId);
  const date = dateArg ?? todayFor(patient);
  const reminders = await prisma.reminder.findMany({ where: { patientId: patient.id, active: true } });
  await ensureOccurrences(patient, date, reminders);
  const occ = await prisma.reminderOccurrence.findMany({ where: { patientId: patient.id, date } });
  const byReminder = new Map(occ.map((o) => [o.reminderId, o]));
  const weekday = weekdayOf(date);
  const todays = reminders.filter((r) => runsOn(r.daysOfWeek, weekday));
  const urls = await mediaUrlMap(todays.flatMap((r) => [r.voiceMediaId, r.photoMediaId]));
  const items = buildDaySchedule(
    todays.map((r) => ({
      id: r.id,
      time: r.time,
      title: r.title,
      detail: r.detail,
      kind: r.kind,
      voiceBy: r.voiceBy,
      occurrenceStatus: byReminder.get(r.id)?.status ?? null,
    })),
  ).map((item) => {
    const r = todays.find((x) => x.id === item.id)!;
    return {
      ...item,
      voiceClipUrl: r.voiceMediaId ? urls.get(r.voiceMediaId) : undefined,
      photoUrl: r.photoMediaId ? urls.get(r.photoMediaId) : undefined,
    };
  });
  return { date, timezone: patient.timezone, items };
}

/** Today's schedule (patient home + caregiver view). */
remindersRouter.get('/patients/:patientId/schedule', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const date = req.query.date ? parse(dateStr, req.query.date) : undefined;
  res.json(await daySchedule(req.access!.patientId, date));
});

/** Reminders in the frontend `Reminder` shape (with today's status). */
remindersRouter.get('/patients/:patientId/reminders', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const patient = await loadPatient(req.access!.patientId);
  const date = todayFor(patient);
  const reminders = await prisma.reminder.findMany({ where: { patientId: patient.id }, orderBy: { time: 'asc' } });
  await ensureOccurrences(patient, date, reminders);
  const occ = await prisma.reminderOccurrence.findMany({ where: { patientId: patient.id, date } });
  const byReminder = new Map(occ.map((o) => [o.reminderId, o]));
  const urls = await mediaUrlMap(reminders.flatMap((r) => [r.voiceMediaId, r.photoMediaId]));
  res.json(
    reminders.map((r) => ({
      id: r.id,
      type: r.kind.toLowerCase(),
      label: r.title,
      detail: r.detail,
      time: r.time,
      daysOfWeek: r.daysOfWeek,
      active: r.active,
      voiceBy: r.voiceBy,
      scheduledAt: zonedTimeToUtc(date, r.time, patient.timezone).toISOString(),
      voiceClipUrl: r.voiceMediaId ? urls.get(r.voiceMediaId) : undefined,
      photoUrl: r.photoMediaId ? urls.get(r.photoMediaId) : undefined,
      status: reminderStatus(byReminder.get(r.id)?.status),
    })),
  );
});

remindersRouter.post('/patients/:patientId/reminders', requireAuth, requirePatientAccess('schedule'), async (req, res) => {
  const body = parse(reminderBody, req.body);
  const patientId = req.access!.patientId;
  if (body.clientId) {
    const existing = await prisma.reminder.findUnique({ where: { clientId: body.clientId } });
    if (existing) {
      if (existing.patientId !== patientId) throw badRequest('clientId already used');
      return res.status(200).json(existing);
    }
  }
  await checkMedia(patientId, [body.voiceMediaId, body.photoMediaId]);
  const r = await prisma.reminder.create({ data: { ...body, detail: body.detail ?? '', voiceBy: body.voiceBy ?? '', daysOfWeek: body.daysOfWeek ?? [], patientId } });
  await audit('reminder.created', { actorId: req.auth!.sub, patientId, meta: { reminderId: r.id } });
  res.status(201).json(r);
});

remindersRouter.patch('/patients/:patientId/reminders/:reminderId', requireAuth, requirePatientAccess('schedule'), async (req, res) => {
  const body = parse(reminderBody.partial().omit({ clientId: true }), req.body);
  const patientId = req.access!.patientId;
  const existing = await prisma.reminder.findFirst({ where: { id: String(req.params.reminderId), patientId } });
  if (!existing) throw notFound('Reminder');
  await checkMedia(patientId, [body.voiceMediaId, body.photoMediaId]);
  const r = await prisma.reminder.update({ where: { id: existing.id }, data: body });
  if (body.time && body.time !== existing.time) {
    // Re-time today's and future open occurrences so the cron fires at the new time.
    const patient = await loadPatient(patientId);
    const open = await prisma.reminderOccurrence.findMany({
      where: { reminderId: r.id, status: 'PENDING', date: { gte: todayFor(patient) }, notifiedAt: null },
    });
    for (const o of open) {
      await prisma.reminderOccurrence.update({ where: { id: o.id }, data: { dueAt: zonedTimeToUtc(o.date, r.time, patient.timezone) } });
    }
  }
  await audit('reminder.updated', { actorId: req.auth!.sub, patientId, meta: { reminderId: r.id } });
  res.json(r);
});

remindersRouter.delete('/patients/:patientId/reminders/:reminderId', requireAuth, requirePatientAccess('schedule'), async (req, res) => {
  const patientId = req.access!.patientId;
  const r = await prisma.reminder.deleteMany({ where: { id: String(req.params.reminderId), patientId } });
  if (!r.count) throw notFound('Reminder');
  await audit('reminder.deleted', { actorId: req.auth!.sub, patientId, meta: { reminderId: req.params.reminderId } });
  res.status(204).end();
});

const eventBody = z.object({
  status: z
    .enum(['done', 'snoozed', 'pending', 'DONE', 'SNOOZED', 'PENDING'])
    .transform((s) => s.toUpperCase() as Extract<OccurrenceStatus, 'DONE' | 'SNOOZED' | 'PENDING'>),
  date: dateStr.optional(),
  snoozeMinutes: z.number().int().min(1).max(240).optional(),
  clientId: z.string().max(64).optional(),
  at: z.string().datetime().optional(),
});

export async function recordReminderEvent(patientId: string, reminderId: string, input: z.infer<typeof eventBody>) {
  if (input.clientId) {
    const dup = await prisma.reminderEvent.findUnique({ where: { clientId: input.clientId } });
    if (dup) return { duplicate: true, status: reminderStatus(dup.status) };
  }
  const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, patientId } });
  if (!reminder) throw notFound('Reminder');
  const patient = await loadPatient(patientId);
  const at = input.at ? new Date(input.at) : new Date();
  const date = input.date ?? todayFor(patient, at);
  await ensureOccurrences(patient, date, [reminder]);
  const occ = await prisma.reminderOccurrence.upsert({
    where: { reminderId_date: { reminderId, date } },
    create: { reminderId, patientId, date, dueAt: zonedTimeToUtc(date, reminder.time, patient.timezone) },
    update: {},
  });
  const snoozedUntil = input.status === 'SNOOZED' ? new Date(at.getTime() + (input.snoozeMinutes ?? 10) * 60_000) : null;
  await prisma.$transaction([
    prisma.reminderOccurrence.update({
      where: { id: occ.id },
      data: {
        status: input.status,
        snoozedUntil,
        completedAt: input.status === 'DONE' ? at : null,
        // A snooze re-notifies when it expires.
        ...(input.status === 'SNOOZED' ? { notifiedAt: null } : {}),
      },
    }),
    prisma.reminderEvent.create({ data: { reminderId, patientId, date, status: input.status, clientId: input.clientId, at } }),
  ]);
  return { duplicate: false, status: reminderStatus(input.status), snoozedUntil: snoozedUntil?.toISOString() ?? null };
}

/** Patient taps Done / Snooze. Idempotent by clientId so offline retries are safe. */
remindersRouter.post(
  '/patients/:patientId/reminders/:reminderId/events',
  requireAuth,
  requirePatientAccess('schedule', { device: true }),
  async (req, res) => {
    const body = parse(eventBody, req.body);
    res.json(await recordReminderEvent(req.access!.patientId, String(req.params.reminderId), body));
  },
);

export { eventBody as reminderEventSchema };
