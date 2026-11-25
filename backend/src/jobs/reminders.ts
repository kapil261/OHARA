import type { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { pushTo } from '../integrations/webpush.js';
import { emailTeam, smsTeam } from '../lib/notify.js';
import { prisma } from '../lib/prisma.js';
import { raiseAlert } from '../modules/alerts/service.js';
import { notifiableTeam } from '../modules/common.js';
import { ensureOccurrences, todayFor } from '../modules/reminders/service.js';

const MIN = 60_000;

const withDevices = { reminder: true, patient: { include: { devices: { where: { revokedAt: null }, select: { id: true } } } } } satisfies Prisma.ReminderOccurrenceInclude;
type OccWithDevices = Prisma.ReminderOccurrenceGetPayload<{ include: typeof withDevices }>;

const ring = (o: OccWithDevices) =>
  pushTo(
    { deviceIds: o.patient.devices.map((d) => d.id) },
    { title: o.reminder.title, body: o.reminder.detail || o.reminder.title, tag: `rem-${o.id}`, url: '/patient', data: { reminderId: o.reminderId, date: o.date } },
  );

/** True when someone on the team has acknowledged the missed-reminder alert, which stops further escalation. */
async function acknowledged(occurrenceId: string) {
  return Boolean(await prisma.alert.findFirst({ where: { occurrenceId, acknowledged: true }, select: { id: true } }));
}

/**
 * One reminder tick (runs every minute). Escalation ladder, in minutes after the reminder is due:
 *   0                 ring on the patient's phone (push)
 *   REPEAT_AFTER_MIN  ring once more if there is no answer
 *   MISSED_AFTER_MIN  mark MISSED; if "alert me if missed" is on, alert the care team (push)
 *   SMS_AFTER_MIN     SMS the care team, unless someone acknowledged the alert
 *   EMAIL_AFTER_MIN   email the care team, unless someone acknowledged the alert
 */
export async function reminderTick(now = new Date()) {
  const ago = (min: number) => new Date(now.getTime() - min * MIN);
  const patients = await prisma.patient.findMany({ where: { deletedAt: null }, select: { id: true, timezone: true, displayName: true } });
  for (const p of patients) await ensureOccurrences(p, todayFor(p, now));

  // Expired snoozes become due again (and ring again).
  await prisma.reminderOccurrence.updateMany({
    where: { status: 'SNOOZED', snoozedUntil: { lte: now } },
    data: { status: 'PENDING', notifiedAt: null, repeatedAt: null, dueAt: now },
  });

  // 1. Due, not yet rung.
  const due = await prisma.reminderOccurrence.findMany({
    where: { status: 'PENDING', notifiedAt: null, dueAt: { lte: now, gt: ago(env.MISSED_AFTER_MIN) }, patient: { deletedAt: null } },
    include: withDevices,
  });
  for (const o of due) {
    await ring(o);
    await prisma.reminderOccurrence.update({ where: { id: o.id }, data: { notifiedAt: now } });
  }

  // 2. Rung once with no answer: ring again.
  const repeat = await prisma.reminderOccurrence.findMany({
    where: {
      status: 'PENDING',
      repeatedAt: null,
      notifiedAt: { lte: ago(env.REPEAT_AFTER_MIN) },
      dueAt: { gt: ago(env.MISSED_AFTER_MIN) },
      patient: { deletedAt: null },
    },
    include: withDevices,
  });
  for (const o of repeat) {
    await ring(o);
    await prisma.reminderOccurrence.update({ where: { id: o.id }, data: { repeatedAt: now } });
  }

  // 3. Overdue: MISSED, and alert the team when the reminder asks for it.
  const overdue = await prisma.reminderOccurrence.findMany({
    where: { status: 'PENDING', dueAt: { lte: ago(env.MISSED_AFTER_MIN) }, patient: { deletedAt: null } },
    include: { reminder: true, patient: { select: { displayName: true } } },
  });
  let alerted = 0;
  for (const o of overdue) {
    await prisma.reminderOccurrence.update({ where: { id: o.id }, data: { status: 'MISSED', caregiverNotifiedAt: now } });
    if (o.reminder.alertIfMissed) {
      alerted++;
      await raiseAlert(
        {
          patientId: o.patientId,
          type: 'MISSED_DOSE',
          severity: o.reminder.kind === 'MEDICINE' ? 'CRITICAL' : 'WARN',
          title: `Missed: ${o.reminder.title}`,
          detail: `${o.patient.displayName} has not confirmed "${o.reminder.title}" (due ${o.reminder.time}).`,
          occurrenceId: o.id,
        },
        { email: false },
      );
    }
  }

  // 4 + 5. Still missed and nobody has acknowledged: SMS, then email. One of each per occurrence.
  const escalate = async (field: 'smsAt' | 'emailedAt', afterMin: number) => {
    const rows = await prisma.reminderOccurrence.findMany({
      where: {
        status: 'MISSED',
        [field]: null,
        reminder: { alertIfMissed: true },
        dueAt: { lte: ago(afterMin), gte: ago(24 * 60) },
        patient: { deletedAt: null },
      },
      include: { reminder: true, patient: { select: { displayName: true } } },
    });
    let sent = 0;
    for (const o of rows) {
      // Mark first so a slow provider never causes a double send on the next tick.
      await prisma.reminderOccurrence.update({ where: { id: o.id }, data: { [field]: now } });
      if (await acknowledged(o.id)) continue;
      const team = await notifiableTeam(o.patientId);
      const alert = await prisma.alert.findFirst({ where: { occurrenceId: o.id }, select: { id: true } });
      const ctx = { patientId: o.patientId, alertId: alert?.id };
      if (field === 'smsAt') {
        sent += await smsTeam(ctx, team.phones, o.patient.displayName, `missed ${o.reminder.title} (due ${o.reminder.time})`);
      } else {
        const url = `${env.APP_URL.replace(/\/$/, '')}/caregiver`;
        const lines = [`"${o.reminder.title}" was due at ${o.reminder.time} and has not been confirmed.`, 'A quick call may help.'];
        sent += await emailTeam(ctx, team.emails, `[OHARA] ${o.patient.displayName} missed "${o.reminder.title}"`, lines, { label: 'Open OHARA', url });
      }
    }
    return sent;
  };
  const smsSent = await escalate('smsAt', env.SMS_AFTER_MIN);
  const emailed = await escalate('emailedAt', env.EMAIL_AFTER_MIN);

  return { patients: patients.length, notified: due.length, repeated: repeat.length, missed: overdue.length, alerted, smsSent, emailed };
}
