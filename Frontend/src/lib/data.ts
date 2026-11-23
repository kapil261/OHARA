import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { games, type CareAlert, type FamilyMember, type Hue, type ScheduleItem, type ScheduleKind, type ScheduleStatus } from './models';
import { queryClient } from './queryClient';
import { useAuthStore } from '../store/authStore';

/**
 * Patient data, read from and written to the API.
 * Each hook is a react-query fetch (runs when a page opens, shows in the Network tab);
 * each action calls the API, then invalidates the matching query so the screen refetches.
 */

/** One finished game. Shown to caregivers, never to the elder. */
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

export type Alert = CareAlert & { acknowledged: boolean };

type ApiScheduleItem = { id: string; time: string; title: string; detail: string; kind: string; voice?: string | null; status: string };
type ApiAlert = { id: string; level: CareAlert['level']; title: string; detail: string; acknowledged: boolean; time: string };
type ApiFamily = { id: string; name: string; relation: string; place?: string | null; hue?: string | null; memory?: string | null; photo?: string | null };
type ApiSession = { id: string; gameId: string; accuracy: number; responseTimeMs: number; hintsUsed: number; rounds: number; completedAt: string };

const KINDS: ScheduleKind[] = ['medicine', 'water', 'meal', 'walk'];
const HUES: Hue[] = ['violet', 'lime', 'sky', 'amber', 'rose', 'teal'];

const toItem = (r: ApiScheduleItem): ScheduleItem => ({
  id: r.id,
  time: r.time,
  title: r.title,
  detail: r.detail ?? '',
  kind: (KINDS.includes(r.kind as ScheduleKind) ? r.kind : 'medicine') as ScheduleKind,
  voice: r.voice ?? '',
  status: (r.status === 'missed' ? 'later' : r.status) as ScheduleStatus,
});

const toFamily = (f: ApiFamily): FamilyMember => ({
  id: f.id,
  name: f.name,
  relation: f.relation,
  place: f.place ?? '',
  hue: (HUES.includes(f.hue as Hue) ? f.hue : 'violet') as Hue,
  memory: f.memory ?? '',
  photo: f.photo ?? undefined,
});

const toSession = (s: ApiSession): SessionResult => ({
  id: s.id,
  gameId: s.gameId,
  gameTitle: games.find((g) => g.id === s.gameId)?.title ?? s.gameId,
  accuracy: s.accuracy,
  responseTimeMs: s.responseTimeMs,
  hintsUsed: s.hintsUsed,
  rounds: s.rounds,
  playedAt: new Date(s.completedAt).getTime(),
});

/** The patient this session reads and writes (a caregiver acts on their patient). */
export const pid = () => {
  const s = useAuthStore.getState();
  return s.actingPatientId ?? s.patientId;
};

const usePid = () => useAuthStore((s) => s.actingPatientId ?? s.patientId);

/** `/patients/:id`, or throws when no patient is linked to this account. */
const base = (id: string | null = pid()) => {
  if (!id) throw new Error('No patient is linked to this account');
  return `/patients/${encodeURIComponent(id)}`;
};

export const keys = {
  schedule: (id: string | null) => ['schedule', id] as const,
  family: (id: string | null) => ['family', id] as const,
  alerts: (id: string | null) => ['alerts', id] as const,
  sessions: (id: string | null) => ['sessions', id] as const,
};

const REFRESH = 30_000;

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

export function useSchedule() {
  const id = usePid();
  const q = useQuery({
    enabled: !!id,
    queryKey: keys.schedule(id),
    queryFn: () => api.get<{ items: ApiScheduleItem[] }>(`${base(id)}/schedule`).then((r) => r.items.map(toItem)).then(renumber),
    refetchInterval: REFRESH,
  });
  return { schedule: q.data ?? [], loading: q.isPending && !!id, error: q.error };
}

export function useFamily() {
  const id = usePid();
  const q = useQuery({
    enabled: !!id,
    queryKey: keys.family(id),
    queryFn: async () => (await api.get<ApiFamily[]>(`${base(id)}/family`)).map(toFamily),
  });
  return { family: q.data ?? [], loading: q.isPending && !!id, error: q.error };
}

export function useAlerts() {
  const id = usePid();
  const q = useQuery({
    enabled: !!id,
    queryKey: keys.alerts(id),
    queryFn: async () => (await api.get<ApiAlert[]>(`${base(id)}/alerts?status=all`)) as Alert[],
    refetchInterval: REFRESH,
  });
  return { alerts: q.data ?? [], loading: q.isPending && !!id, error: q.error };
}

export function useSessions() {
  const id = usePid();
  const q = useQuery({
    enabled: !!id,
    queryKey: keys.sessions(id),
    queryFn: async () => (await api.get<ApiSession[]>(`${base(id)}/sessions?limit=50`)).map(toSession),
  });
  return { sessions: q.data ?? [], loading: q.isPending && !!id, error: q.error };
}

/** Cached schedule, for code outside React (the reminder clock). */
export const cachedSchedule = () => queryClient.getQueryData<ScheduleItem[]>(keys.schedule(pid())) ?? [];

const refresh = (...which: (keyof typeof keys)[]) =>
  Promise.all(which.map((k) => queryClient.invalidateQueries({ queryKey: [k] })));

/** Run a write, then refetch so the screen shows the server's truth. Resolves true on success; failures are logged. */
const write = async (fn: () => Promise<unknown>, ...which: (keyof typeof keys)[]): Promise<boolean> => {
  try {
    await fn();
    return true;
  } catch (e) {
    console.error('[ohara] API write failed', e);
    return false;
  } finally {
    await refresh(...which);
  }
};

// ---------- actions ----------

export const setStatus = (id: string, status: ScheduleStatus) =>
  write(
    () =>
      api.post(
        `${base()}/reminders/${encodeURIComponent(id)}/events`,
        status === 'done' ? { status: 'done' } : status === 'snoozed' ? { status: 'snoozed', snoozeMinutes: 10 } : { status: 'pending' },
      ),
    'schedule',
    'alerts',
  );

export const upsertReminder = (item: Omit<ScheduleItem, 'id' | 'status'> & { id?: string }) => {
  const body = { kind: item.kind.toUpperCase(), time: item.time, title: item.title, detail: item.detail || undefined, voiceBy: item.voice || undefined };
  return write(
    () => (item.id ? api.patch(`${base()}/reminders/${encodeURIComponent(item.id)}`, body) : api.post(`${base()}/reminders`, body)),
    'schedule',
  );
};

export const removeReminder = (id: string) => write(() => api.delete(`${base()}/reminders/${encodeURIComponent(id)}`), 'schedule');

export const addFamily = (m: Omit<FamilyMember, 'id'>) =>
  write(
    () => api.post(`${base()}/family`, { name: m.name, relation: m.relation, place: m.place || undefined, hue: m.hue, memory: m.memory || undefined }),
    'family',
  );

export const removeFamily = (id: string) => write(() => api.delete(`${base()}/family/${encodeURIComponent(id)}`), 'family');

export const acknowledge = (id: string) => write(() => api.post(`${base()}/alerts/${encodeURIComponent(id)}/ack`), 'alerts');

/** The server stores the session and raises any alerts itself. */
export const recordSession = (r: Omit<SessionResult, 'id' | 'playedAt'>) =>
  write(
    () =>
      api.post(`${base()}/sessions`, {
        gameId: r.gameId,
        level: 1,
        accuracy: Math.min(1, Math.max(0, r.accuracy)),
        responseTimeMs: Math.round(r.responseTimeMs),
        hintsUsed: r.hintsUsed,
        rounds: r.rounds,
        durationMs: Math.round(r.responseTimeMs * Math.max(1, r.rounds) * 4),
      }),
    'sessions',
    'alerts',
  );

export const sendSos = () => write(() => api.post(`${base()}/sos`, {}), 'alerts');
