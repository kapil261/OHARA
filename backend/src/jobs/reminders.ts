import { env } from '../config/env.js';
import { sendMail, simpleHtml } from '../integrations/mailer.js';
import { pushTo } from '../integrations/webpush.js';
import { prisma } from '../lib/prisma.js';
import { raiseAlert } from '../modules/alerts/service.js';
import { notifiableTeam } from '../modules/common.js';
import { ensureOccurrences, todayFor } from '../modules/reminders/service.js';

const MIN = 60_000;

/**
 * One reminder tick (runs every minute):
 * 1. make sure today's occurrences exist, 2. push due reminders to the patient device,
 * 3. return expired snoozes to PENDING, 4. mark overdue ones MISSED and alert the team,
 * 5. email the team when a reminder is still missed after EMAIL_AFTER_MIN.
 */
export async function reminderTick(now = new Date()) {
  const patients = await prisma.patient.findMany({ where: { deletedAt: null }, select: { id: true, timezone: true, displayName: true } });
  for (const p of patients) await ensureOccurrences(p, todayFor(p, now));

  // Expired snoozes become due again (and get a fresh push).
  await prisma.reminderOccurrence.updateMany({
    where: { status: 'SNOOZED', snoozedUntil: { lte: now } },
    data: { status: 'PENDING', notifiedAt: null, dueAt: now },
  });

  // Due, not yet notified → push to the patient's devices.
  const due = await prisma.reminderOccurrence.findMany({
    where: { status: 'PENDING', notifiedAt: null, dueAt: { lte: now, gte: new Date(now.getTime() - env.MISSED_AFTER_MIN * MIN) }, patient: { deletedAt: null } },
    include: { reminder: true, patient: { include: { devices: { where: { revokedAt: null }, select: { id: true } } } } },
  });
  for (const o of due) {
    await pushTo(
      { deviceIds: o.patient.devices.map((d) => d.id) },
      { title: o.reminder.title, body: o.reminder.detail || o.reminder.title, tag: `rem-${o.id}`, url: '/patient', data: { reminderId: o.reminderId, date: o.date } },
    );
    await prisma.reminderOccurrence.update({ where: { id: o.id }, data: { notifiedAt: now } });
  }

  // Overdue → MISSED + WARN alert to the care team.
  const overdue = await prisma.reminderOccurrence.findMany({
    where: { status: 'PENDING', dueAt: { lte: new Date(now.getTime() - env.MISSED_AFTER_MIN * MIN) }, patient: { deletedAt: null } },
    include: { reminder: true, patient: { select: { displayName: true } } },
  });
  for (const o of overdue) {
    await prisma.reminderOccurrence.update({ where: { id: o.id }, data: { status: 'MISSED', caregiverNotifiedAt: now } });
    if (o.reminder.kind === 'MEDICINE' || o.reminder.kind === 'APPOINTMENT') {
      await raiseAlert(
        { patientId: o.patientId, type: 'MISSED_DOSE', severity: 'WARN', title: `Missed: ${o.reminder.title}`, detail: `${o.patient.displayName} has not confirmed "${o.reminder.title}" (due ${o.reminder.time}).` },
        { email: false },
      );
    }
  }

  // Still missed after EMAIL_AFTER_MIN → one email per occurrence.
  const toEmail = await prisma.reminderOccurrence.findMany({
    where: { status: 'MISSED', emailedAt: null, dueAt: { lte: new Date(now.getTime() - env.EMAIL_AFTER_MIN * MIN), gte: new Date(now.getTime() - 24 * 60 * MIN) } },
    include: { reminder: true, patient: { select: { displayName: true } } },
  });
  for (const o of toEmail) {
    const team = await notifiableTeam(o.patientId);
    if (team.emails.length) {
      const url = `${env.APP_URL.replace(/\/$/, '')}/caregiver`;
      const subject = `[OHARA] ${o.patient.displayName} missed "${o.reminder.title}"`;
      const lines = [`"${o.reminder.title}" was due at ${o.reminder.time} and has not been confirmed.`, 'A quick call may help.'];
      await sendMail({ to: team.emails, subject, text: `${lines.join('\n')}\n\n${url}`, html: simpleHtml(subject, lines, { label: 'Open OHARA', url }) });
    }
    await prisma.reminderOccurrence.update({ where: { id: o.id }, data: { emailedAt: now } });
  }

  return { patients: patients.length, notified: due.length, missed: overdue.length, emailed: toEmail.length };
}
