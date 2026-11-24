/** Shared types and the fixed games catalogue. All user data comes from the API (see lib/data.ts). */

export type ScheduleKind = 'medicine' | 'water' | 'meal' | 'walk';
export type ScheduleStatus = 'done' | 'next' | 'later' | 'snoozed';

export interface ScheduleItem {
  id: string;
  /** 24-hour "HH:MM" so reminders sort and ring on the real clock. */
  time: string;
  title: string;
  detail: string;
  kind: ScheduleKind;
  status: ScheduleStatus;
  voice: string; // whose recorded voice plays it
}

/** "18:00" → "6:00 PM" */
export const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
};

export type Hue = 'violet' | 'lime' | 'sky' | 'amber' | 'rose' | 'teal';

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  place: string;
  hue: Hue;
  memory: string;
  /** Object URL of a photo the caregiver added (demo only, lost on refresh). */
  photo?: string;
}

export interface Game {
  id: string;
  title: string;
  trains: string;
  blurb: string;
  minutes: number;
  hue: Hue;
}

export const games: Game[] = [
  { id: 'memory-match', title: 'Memory Match', trains: 'Short-term memory', blurb: 'Turn the cards and find the pairs.', minutes: 5, hue: 'violet' },
  { id: 'who-is-this', title: 'Who is this?', trains: 'Recognition', blurb: 'Look at a family photo and say the name.', minutes: 4, hue: 'rose' },
  { id: 'my-day', title: 'My Day', trains: 'Routine recall', blurb: 'Put the morning in the right order.', minutes: 5, hue: 'amber' },
  { id: 'sounds-of-home', title: 'Sounds of Home', trains: 'Attention, reminiscence', blurb: 'Listen and guess: rain, temple bell, the market…', minutes: 6, hue: 'teal' },
];


export type AlertLevel = 'urgent' | 'warn' | 'info';
export interface CareAlert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  time: string;
}

export interface CareTeamMember {
  id: string;
  name: string;
  role: string;
  access: string;
  hue: Hue;
}

export type HwStatus = 'attention' | 'watch' | 'stable';
export interface HwPatient {
  id: string;
  name: string;
  age: number;
  village: string;
  status: HwStatus;
  reason: string;
  lastSeen: string;
  adherence: number; // 0..1 medicine reminders done this week
  trend: number[]; // daily activity vs own baseline, last 7 days
  caregiver: string;
}

