import { describe, expect, it } from 'vitest';
import { buildDaySchedule, reminderStatus, runsOn, type ScheduleRow } from '../src/utils/schedule.js';

const row = (id: string, time: string, occurrenceStatus: ScheduleRow['occurrenceStatus']): ScheduleRow => ({
  id, time, title: id, detail: '', kind: 'MEDICINE', voiceBy: 'Rina', occurrenceStatus,
});

describe('buildDaySchedule', () => {
  it('sorts by time and marks the first open item as next', () => {
    const out = buildDaySchedule([row('c', '17:00', 'PENDING'), row('a', '08:00', 'DONE'), row('b', '13:00', null), row('d', '09:00', 'MISSED')]);
    expect(out.map((r) => [r.id, r.status])).toEqual([['a', 'done'], ['d', 'missed'], ['b', 'next'], ['c', 'later']]);
    expect(out[0].kind).toBe('medicine');
  });
  it('a snoozed item takes the next slot', () => {
    const out = buildDaySchedule([row('a', '08:00', 'SNOOZED'), row('b', '09:00', 'PENDING')]);
    expect(out.map((r) => r.status)).toEqual(['snoozed', 'later']);
  });
});

describe('reminder helpers', () => {
  it('maps statuses', () => {
    expect(reminderStatus('DONE')).toBe('done');
    expect(reminderStatus(null)).toBe('pending');
  });
  it('empty daysOfWeek means every day', () => {
    expect(runsOn([], 3)).toBe(true);
    expect(runsOn([1, 5], 3)).toBe(false);
  });
});
