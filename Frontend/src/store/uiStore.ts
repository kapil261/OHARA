import { create } from 'zustand';

/**
 * Device-only UI state: display settings and the reminder that is ringing.
 * Patient data (schedule, family, alerts, sessions) is not kept here: it comes from the API through lib/data.ts.
 */

export type Lang = 'en' | 'as' | 'hi';

export interface Settings {
  lang: Lang;
  textSize: 'large' | 'xl';
  voiceOn: boolean;
  voiceRate: 'slow' | 'normal';
}

export type { SessionResult } from '../lib/data';

interface UiState {
  settings: Settings;
  /** The SOS was sent from this screen (shows the "help is coming" state). */
  sosSent: boolean;
  /** The reminder ringing full-screen right now, if any. */
  ringingId: string | null;
  /** Reminders that already rang today (so the clock doesn't ring them twice). */
  rung: string[];

  ring: (id: string) => void;
  stopRinging: () => void;
  /** Let a reminder ring again (after it is edited or snoozed). */
  unring: (id: string) => void;
  setSettings: (p: Partial<Settings>) => void;
  setSosSent: (v: boolean) => void;
  reset: () => void;
}

const fresh = () => ({
  settings: { lang: 'en', textSize: 'large', voiceOn: true, voiceRate: 'slow' } as Settings,
  sosSent: false,
  ringingId: null as string | null,
  rung: [] as string[],
});

export const useUiStore = create<UiState>((set) => ({
  ...fresh(),
  ring: (id) => set((st) => ({ ringingId: id, rung: st.rung.includes(id) ? st.rung : [...st.rung, id] })),
  stopRinging: () => set({ ringingId: null }),
  unring: (id) => set((st) => ({ rung: st.rung.filter((r) => r !== id) })),
  setSettings: (p) => set((st) => ({ settings: { ...st.settings, ...p } })),
  setSosSent: (v) => set({ sosSent: v }),
  reset: () => set(fresh()),
}));
