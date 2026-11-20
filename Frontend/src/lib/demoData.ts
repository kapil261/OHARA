/**
 * Demo data: everything the screens show until the backend is wired.
 * One file so swapping to the real API later is a find-and-replace of imports.
 */

export const demoPatient = {
  id: 'demo-patient',
  displayName: 'Bina',
  fullName: 'Bina Kalita',
  age: 72,
  place: 'Jorhat, Assam',
  language: 'Assamese',
};

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

export const schedule: ScheduleItem[] = [
  { id: 's1', time: '08:00', title: 'Morning medicine', detail: 'One white tablet after tea', kind: 'medicine', status: 'done', voice: 'Rina' },
  { id: 's2', time: '10:30', title: 'Drink water', detail: 'One full glass', kind: 'water', status: 'done', voice: 'Rina' },
  { id: 's3', time: '13:00', title: 'Lunch', detail: 'Rice, dal and fish', kind: 'meal', status: 'done', voice: 'Arup' },
  { id: 's4', time: '17:00', title: 'Evening walk', detail: 'Around the garden with Arup', kind: 'walk', status: 'later', voice: 'Arup' },
  { id: 's5', time: '18:00', title: 'Evening medicine', detail: 'One white tablet', kind: 'medicine', status: 'next', voice: 'Rina' },
  { id: 's6', time: '20:30', title: 'Dinner', detail: 'Roti and sabji', kind: 'meal', status: 'later', voice: 'Rina' },
];

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

export const family: FamilyMember[] = [
  { id: 'f1', name: 'Rina', relation: 'Daughter', place: 'Guwahati', hue: 'violet', memory: 'Her wedding at Kamakhya, 2004' },
  { id: 'f2', name: 'Arup', relation: 'Son', place: 'Jorhat', hue: 'teal', memory: 'Fishing at the pond every Sunday' },
  { id: 'f3', name: 'Moni', relation: 'Granddaughter', place: 'Bengaluru', hue: 'rose', memory: 'Her first Bihu dance' },
  { id: 'f4', name: 'Dipen', relation: 'Husband', place: 'Jorhat', hue: 'amber', memory: 'The tea garden walks' },
  { id: 'f5', name: 'Jyoti', relation: 'Sister', place: 'Dibrugarh', hue: 'sky', memory: 'Making pitha together' },
  { id: 'f6', name: 'Bablu', relation: 'Grandson', place: 'Delhi', hue: 'lime', memory: 'Learning to ride a cycle' },
];

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

/** Minutes of activity per day, compared with Bina's own 14-day baseline (never with others). */
export const weekActivity = [
  { day: 'Mon', minutes: 18 },
  { day: 'Tue', minutes: 22 },
  { day: 'Wed', minutes: 12 },
  { day: 'Thu', minutes: 20 },
  { day: 'Fri', minutes: 9 },
  { day: 'Sat', minutes: 16 },
  { day: 'Sun', minutes: 14 },
];
export const activityBaseline = 16;

export type AlertLevel = 'urgent' | 'warn' | 'info';
export interface CareAlert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  time: string;
}

export const alerts: CareAlert[] = [
  { id: 'a1', level: 'warn', title: 'Water reminder missed', detail: 'No response to the 10:30 AM reminder for 15 minutes.', time: '10:45 AM' },
  { id: 'a2', level: 'info', title: 'Lower activity on Friday', detail: 'Played 9 min, below her usual 16 min. One day only — no action needed yet.', time: 'Yesterday' },
  { id: 'a3', level: 'info', title: 'Played Memory Match', detail: '12 minutes, finished on a win. Used 2 gentle hints.', time: '9:20 AM' },
];

export interface CareTeamMember {
  id: string;
  name: string;
  role: string;
  access: string;
  hue: Hue;
}

export const careTeam: CareTeamMember[] = [
  { id: 't1', name: 'Rina Kalita', role: 'Daughter · Guwahati', access: 'Owner', hue: 'violet' },
  { id: 't2', name: 'Arup Kalita', role: 'Son · Jorhat', access: 'Schedule, upload', hue: 'teal' },
  { id: 't3', name: 'Dr. Anil Bora', role: 'Doctor · Jorhat Medical College', access: 'View, export', hue: 'sky' },
  { id: 't4', name: 'Mousumi Das', role: 'ASHA worker · Titabar', access: 'View', hue: 'amber' },
];

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

export const hwPatients: HwPatient[] = [
  { id: 'p1', name: 'Hemanta Saikia', age: 78, village: 'Titabar', status: 'attention', reason: 'Missed 4 evening doses this week', lastSeen: '2 days ago', adherence: 0.43, trend: [14, 12, 10, 9, 7, 6, 5], caregiver: 'Pranab Saikia (son)' },
  { id: 'p2', name: 'Bina Kalita', age: 72, village: 'Jorhat', status: 'watch', reason: 'Activity below her baseline on 2 days', lastSeen: 'Today, 9:20 AM', adherence: 0.86, trend: [18, 22, 12, 20, 9, 16, 14], caregiver: 'Rina Kalita (daughter)' },
  { id: 'p3', name: 'Lakhi Gogoi', age: 81, village: 'Mariani', status: 'attention', reason: 'SOS pressed yesterday, resolved', lastSeen: 'Yesterday', adherence: 0.71, trend: [10, 11, 9, 12, 8, 10, 9], caregiver: 'Nitu Gogoi (daughter-in-law)' },
  { id: 'p4', name: 'Ramesh Baruah', age: 69, village: 'Teok', status: 'stable', reason: 'On track with his routine', lastSeen: 'Today, 8:05 AM', adherence: 1, trend: [15, 16, 17, 15, 18, 17, 19], caregiver: 'Anjali Baruah (wife)' },
  { id: 'p5', name: 'Kamala Das', age: 75, village: 'Titabar', status: 'watch', reason: 'Recognition game slower than usual', lastSeen: 'Today, 11:40 AM', adherence: 0.93, trend: [16, 15, 15, 13, 14, 12, 12], caregiver: 'Bijoy Das (son)' },
  { id: 'p6', name: 'Jogen Hazarika', age: 84, village: 'Mariani', status: 'stable', reason: 'On track with his routine', lastSeen: 'Today, 7:30 AM', adherence: 0.9, trend: [12, 13, 12, 14, 13, 14, 15], caregiver: 'Rupa Hazarika (daughter)' },
];
