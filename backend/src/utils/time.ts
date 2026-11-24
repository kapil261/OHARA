/**
 * Timezone helpers built on Intl only (no extra dependency).
 * Reminder times are stored as local "HH:MM" in the patient's timezone.
 */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isHHMM = (s: string) => HHMM.test(s);

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function zonedParts(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const get = (t: string) => fmt.formatToParts(date).find((p) => p.type === t)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

/** Local calendar date "YYYY-MM-DD" of `date` in `timeZone`. */
export function localDate(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Local "HH:MM" of `date` in `timeZone`. */
export function localHHMM(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Offset (ms) of `timeZone` from UTC at instant `date`. */
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC instant for local wall-clock `dateStr` + `hhmm` in `timeZone`. */
export function zonedTimeToUtc(dateStr: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  // Two passes handle DST edges for zones that have them.
  let ts = guess - offsetMs(new Date(guess), timeZone);
  ts = guess - offsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

/** Day of week (0 = Sunday) of a "YYYY-MM-DD" date string. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Shift a "YYYY-MM-DD" by `days`. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** "5 min ago", "2 days ago", "Today, 9:20 AM" style label used by the health-worker list. */
export function relativeLabel(when: Date | null | undefined, now: Date, timeZone: string): string {
  if (!when) return 'Never';
  const today = localDate(now, timeZone);
  const day = localDate(when, timeZone);
  const time = when.toLocaleTimeString('en-IN', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
  if (day === today) return `Today, ${time}`;
  if (day === addDays(today, -1)) return 'Yesterday';
  const diffDays = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000);
  return `${diffDays} days ago`;
}
