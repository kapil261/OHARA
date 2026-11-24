import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { CareTeamMember, Hue, HwPatient } from './models';
import { useMe } from './queries';
import { useAuthStore } from '../store/authStore';

/** Read hooks for the patient profile, progress, care team and health-worker list. All data comes from the API. */

const HUES: Hue[] = ['violet', 'lime', 'sky', 'amber', 'rose', 'teal'];
const asHue = (h: string | null | undefined, i: number): Hue => (HUES.includes(h as Hue) ? (h as Hue) : HUES[i % HUES.length]);

const usePatientKey = () => {
  const token = useAuthStore((s) => s.token);
  const patient = useAuthStore((s) => s.actingPatientId ?? s.patientId);
  return { live: !!token && !!patient, patient };
};

/** Name, age, place and language of the patient this session is about. */
export type PatientInfo = { id: string; displayName: string; fullName: string; age: number | null; place: string; language: string };

export function usePatientInfo(): PatientInfo {
  const { data } = useMe(false);
  const p = data?.patient;
  if (!p) return { id: '', displayName: '', fullName: '', age: null, place: '', language: '' };
  return {
    id: p.id,
    displayName: p.displayName,
    fullName: p.fullName || p.displayName,
    age: p.age ?? null,
    place: p.place ?? '',
    language: p.language ?? '',
  };
}

type ApiProgress = { weekActivity: { date: string; day: string; minutes: number }[]; activityBaseline: number };

/** Last 7 days of brain-game minutes and the patient's usual level. */
export function useProgress(): { weekActivity: { day: string; minutes: number }[]; activityBaseline: number } {
  const { live, patient } = usePatientKey();
  const q = useQuery({
    enabled: live,
    queryKey: ['progress', patient],
    queryFn: async () => {
      const r = await api.get<ApiProgress>(`/patients/${encodeURIComponent(patient!)}/progress`);
      return { weekActivity: r.weekActivity.map((d) => ({ day: d.day, minutes: d.minutes })), activityBaseline: r.activityBaseline };
    },
    refetchInterval: 30_000,
  });
  return q.data ?? { weekActivity: [], activityBaseline: 0 };
}

/** "78 years · Jorhat · speaks Assamese", skipping missing parts. */
export const patientLine = (p: PatientInfo) =>
  [p.age ? `${p.age} years` : null, p.place || null, p.language ? `speaks ${p.language}` : null].filter(Boolean).join(' · ');

type ApiMember = { id: string; name: string; role: string; permissions: string[]; isOwner: boolean; hue?: string | null };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/** The patient's care team. */
export function useTeam(): CareTeamMember[] {
  const { live, patient } = usePatientKey();
  const q = useQuery({
    enabled: live,
    queryKey: ['team', patient],
    queryFn: async () => {
      const rows = await api.get<ApiMember[]>(`/patients/${encodeURIComponent(patient!)}/team`);
      return rows.map<CareTeamMember>((m, i) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        access: m.isOwner ? 'Owner' : m.permissions.map(cap).join(', ') || 'View',
        hue: asHue(m.hue, i),
      }));
    },
  });
  return q.data ?? [];
}

type ApiHwPatient = Omit<HwPatient, 'age'> & { age: number | null };

/** Patients on this health worker's list. */
export function useHwPatients(): { patients: HwPatient[]; loading: boolean } {
  const token = useAuthStore((s) => s.token);
  const live = !!token;
  const q = useQuery({
    enabled: live,
    queryKey: ['hw-patients'],
    queryFn: async () => (await api.get<ApiHwPatient[]>('/health-worker/patients')).map((p) => ({ ...p, age: p.age ?? 0 })),
    refetchInterval: 30_000,
  });
  return { patients: q.data ?? [], loading: live && q.isPending };
}
