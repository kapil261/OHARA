import { create } from 'zustand';
import {
  alerts as seedAlerts,
  family as seedFamily,
  schedule as seedSchedule,
  type CareAlert,
  type FamilyMember,
  type ScheduleItem,
  type ScheduleStatus,
} from '../lib/demoData';

/**
 * Demo-only state (frontend first; the backend replaces this later).
 * Lives in memory: everything resets on refresh, or with "Reset demo".
 */

export type Lang = 'en' | 'as' | 'hi';

export interface Settings {
  lang: Lang;
  textSize: 'large' | 'xl';
  voiceOn: boolean;
  voiceRate: 'slow' | 'normal';
}

/** One finished game — the README's SessionResult. Shown to caregivers, never to the elder. */
export interface SessionResult {
  id: string;
  gameId: string;
  gameTitle: string;
  accuracy: number; // 0..1, first-try answers
  responseTimeMs: number; // average per answer
  hintsUsed: number;
  rounds: number;
  playedAt: number;
}

type Alert = CareAlert & { acknowledged: boolean };

interface DemoState {
  schedule: ScheduleItem[];
  family: FamilyMember[];
  alerts: Alert[];
  sessions: SessionResult[];
  settings: Settings;
  sosSent: boolean;
  /** The reminder ringing full-screen right now, if any. */
  ringingId: string | null;
  /** Reminders that already rang today (so the clock doesn't ring them twice). */
  rung: string[];

  setStatus: (id: string, status: ScheduleStatus) => void;
  upsertReminder: (item: Omit<ScheduleItem, 'id' | 'status'> & { id?: string }) => void;
  removeReminder: (id: string) => void;
  ring: (id: string) => void;
  stopRinging: () => void;

  addFamily: (m: Omit<FamilyMember, 'id'>) => void;
  removeFamily: (id: string) => void;

  acknowledge: (id: string) => void;
  addAlert: (a: Omit<Alert, 'id' | 'acknowledged'>) => void;

  recordSession: (r: Omit<SessionResult, 'id' | 'playedAt'>) => void;
  setSettings: (p: Partial<Settings>) => void;
  sendSos: () => void;
  reset: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const fresh = () => ({
  schedule: seedSchedule.map((s) => ({ ...s })),
  family: seedFamily.map((f) => ({ ...f })),
  alerts: seedAlerts.map((a) => ({ ...a, acknowledged: false })),
  sessions: [] as SessionResult[],
  settings: { lang: 'en', textSize: 'large', voiceOn: true, voiceRate: 'slow' } as Settings,
  sosSent: false,
  ringingId: null as string | null,
  rung: [] as string[],
});

/** Sort by time; the first item not yet done (and not snoozed) becomes "next". */
const renumber = (items: ScheduleItem[]): ScheduleItem[] => {
  let nextGiven = false;
  return [...items]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((s) => {
      if (s.status === 'done' || s.status === 'snoozed') return s;
      if (!nextGiven) {
        nextGiven = true;
        return { ...s, status: 'next' as const };
      }
      return { ...s, status: 'later' as const };
    });
};

export const useDemoStore = create<DemoState>((set, get) => ({
  ...fresh(),

  setStatus: (id, status) => set((st) => ({ schedule: renumber(st.schedule.map((s) => (s.id === id ? { ...s, status } : s))) })),

  upsertReminder: (item) =>
    set((st) => {
      if (item.id && st.schedule.some((s) => s.id === item.id)) {
        return { schedule: renumber(st.schedule.map((s) => (s.id === item.id ? { ...s, ...item, id: s.id } : s))), rung: st.rung.filter((r) => r !== item.id) };
      }
      return { schedule: renumber([...st.schedule, { ...item, id: uid(), status: 'later' }]) };
    }),

  removeReminder: (id) => set((st) => ({ schedule: renumber(st.schedule.filter((s) => s.id !== id)), ringingId: st.ringingId === id ? null : st.ringingId })),

  ring: (id) => set((st) => ({ ringingId: id, rung: st.rung.includes(id) ? st.rung : [...st.rung, id] })),
  stopRinging: () => set({ ringingId: null }),

  addFamily: (m) => set((st) => ({ family: [...st.family, { ...m, id: uid() }] })),
  removeFamily: (id) =>
    set((st) => {
      const gone = st.family.find((f) => f.id === id);
      if (gone?.photo) URL.revokeObjectURL(gone.photo);
      return { family: st.family.filter((f) => f.id !== id) };
    }),

  acknowledge: (id) => set((st) => ({ alerts: st.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)) })),
  addAlert: (a) => set((st) => ({ alerts: [{ ...a, id: uid(), acknowledged: false }, ...st.alerts] })),

  recordSession: (r) => {
    set((st) => ({ sessions: [{ ...r, id: uid(), playedAt: Date.now() }, ...st.sessions] }));
    get().addAlert({
      level: 'info',
      title: `Played ${r.gameTitle}`,
      detail: `${r.rounds} round${r.rounds > 1 ? 's' : ''}, finished on a win. Used ${r.hintsUsed} gentle hint${r.hintsUsed === 1 ? '' : 's'}.`,
      time: 'Just now',
    });
  },

  setSettings: (p) => set((st) => ({ settings: { ...st.settings, ...p } })),

  sendSos: () => {
    set({ sosSent: true });
    get().addAlert({ level: 'urgent', title: 'SOS from Bina', detail: 'Bina held the SOS button. Call her now.', time: 'Just now' });
  },

  reset: () => {
    get().family.forEach((f) => f.photo && URL.revokeObjectURL(f.photo));
    set(fresh());
  },
}));
