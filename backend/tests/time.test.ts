import { describe, expect, it } from 'vitest';
import { addDays, isHHMM, isValidTimeZone, localDate, localHHMM, weekdayOf, zonedTimeToUtc } from '../src/utils/time.js';

describe('time utils', () => {
  it('converts local wall-clock time in Asia/Kolkata to UTC', () => {
    expect(zonedTimeToUtc('2026-11-23', '08:00', 'Asia/Kolkata').toISOString()).toBe('2026-11-23T02:30:00.000Z');
  });
  it('handles DST zones', () => {
    expect(zonedTimeToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(zonedTimeToUtc('2026-01-15', '09:00', 'America/New_York').toISOString()).toBe('2026-01-15T14:00:00.000Z');
  });
  it('round-trips local date and time', () => {
    const d = zonedTimeToUtc('2026-11-23', '23:45', 'Asia/Kolkata');
    expect(localDate(d, 'Asia/Kolkata')).toBe('2026-11-23');
    expect(localHHMM(d, 'Asia/Kolkata')).toBe('23:45');
    expect(localDate(d, 'UTC')).toBe('2026-11-23');
  });
  it('does date arithmetic across month/year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOf('2026-11-23')).toBe(1); // Monday
  });
  it('validates inputs', () => {
    expect(isHHMM('08:30')).toBe(true);
    expect(isHHMM('24:00')).toBe(false);
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
  });
});
