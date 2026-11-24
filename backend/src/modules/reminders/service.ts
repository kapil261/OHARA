import type { Patient, Reminder } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { runsOn } from '../../utils/schedule.js';
import { localDate, weekdayOf, zonedTimeToUtc } from '../../utils/time.js';

/** Make sure every active reminder that runs on `date` has an occurrence row for it. */
export async function ensureOccurrences(patient: Pick<Patient, 'id' | 'timezone'>, date: string, reminders?: Reminder[]) {
  const list = reminders ?? (await prisma.reminder.findMany({ where: { patientId: patient.id, active: true } }));
  const weekday = weekdayOf(date);
  const data = list
    .filter((r) => r.active && runsOn(r.daysOfWeek, weekday))
    .map((r) => ({ reminderId: r.id, patientId: patient.id, date, dueAt: zonedTimeToUtc(date, r.time, patient.timezone) }));
  if (data.length) await prisma.reminderOccurrence.createMany({ data, skipDuplicates: true });
}

export const todayFor = (patient: Pick<Patient, 'timezone'>, now = new Date()) => localDate(now, patient.timezone);
