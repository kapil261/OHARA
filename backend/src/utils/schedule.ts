import type { OccurrenceStatus, ReminderKind } from '@prisma/client';

/** Frontend ScheduleItem (demo shape) + Reminder (types.ts shape) in one object. */
export type ScheduleStatus = 'done' | 'next' | 'later' | 'snoozed' | 'missed';

export interface ScheduleRow {
  id: string;
  time: string;
  title: string;
  detail: string;
  kind: ReminderKind;
  voiceBy: string;
  occurrenceStatus: OccurrenceStatus | null;
}

const lower = (k: ReminderKind) => k.toLowerCase() as 'medicine' | 'water' | 'meal' | 'walk' | 'appointment';

/**
 * Compute UI statuses for one day's schedule, sorted by time.
 * The first item that is still open (pending or snoozed) is "next"; snoozed keeps its own label.
 */
export function buildDaySchedule(rows: ScheduleRow[]) {
  const sorted = [...rows].sort((a, b) => a.time.localeCompare(b.time));
  let nextAssigned = false;
  return sorted.map((r) => {
    let status: ScheduleStatus;
    if (r.occurrenceStatus === 'DONE') status = 'done';
    else if (r.occurrenceStatus === 'MISSED') status = 'missed';
    else if (r.occurrenceStatus === 'SNOOZED') {
      status = 'snoozed';
      nextAssigned = true;
    } else if (!nextAssigned) {
      status = 'next';
      nextAssigned = true;
    } else status = 'later';
    return { id: r.id, time: r.time, title: r.title, detail: r.detail, kind: lower(r.kind), voice: r.voiceBy, status };
  });
}

/** Map a stored status to the frontend Reminder.status union. */
export function reminderStatus(s: OccurrenceStatus | null | undefined): 'pending' | 'snoozed' | 'done' | 'missed' {
  if (s === 'DONE') return 'done';
  if (s === 'SNOOZED') return 'snoozed';
  if (s === 'MISSED') return 'missed';
  return 'pending';
}

/** True when the reminder runs on the given weekday (empty list = every day). */
export const runsOn = (daysOfWeek: number[], weekday: number) => daysOfWeek.length === 0 || daysOfWeek.includes(weekday);
