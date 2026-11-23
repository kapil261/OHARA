import type { MeResponse, Role } from '../types';
import { demoPatient } from './demoData';

/**
 * Demo mode: lets you use every screen without a backend.
 * Turned on by the login page's "Try as …" buttons, or by `?dev=patient|caregiver|healthworker`.
 * The role is remembered for this browser tab (sessionStorage) until Sign out.
 */
const KEY = 'ohara-demo-role';

const ROLE_FROM_PARAM: Record<string, Role> = {
  patient: 'PATIENT',
  caregiver: 'CAREGIVER',
  healthworker: 'HEALTH_WORKER',
  health_worker: 'HEALTH_WORKER',
  'health-worker': 'HEALTH_WORKER',
};

const store = {
  get: (): string | null => {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set: (v: string) => {
    try {
      sessionStorage.setItem(KEY, v);
    } catch {
      /* private mode: demo lasts until reload */
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};

let memoryRole: Role | null = null;

export const setDemoRole = (role: Role) => {
  memoryRole = role;
  store.set(role);
};

export const clearDemo = () => {
  memoryRole = null;
  store.clear();
};

/** The active demo role, if any. A `?dev=` param wins and is remembered. */
export const getDemoRole = (): Role | null => {
  if (typeof window === 'undefined') return null;
  const param = new URLSearchParams(window.location.search).get('dev')?.toLowerCase();
  if (param && ROLE_FROM_PARAM[param]) {
    setDemoRole(ROLE_FROM_PARAM[param]);
    return ROLE_FROM_PARAM[param];
  }
  const saved = store.get() as Role | null;
  if (saved && Object.values(ROLE_FROM_PARAM).includes(saved)) return saved;
  return memoryRole;
};

export const demoMe = (role: Role): MeResponse => ({
  role,
  patientId: demoPatient.id,
  patient: { id: demoPatient.id, displayName: demoPatient.displayName, language: 'en' },
  permissions: ['view', 'schedule', 'upload', 'export', 'delete', 'manage_team'],
  onboardingCompleted: true,
  actingPatientId: role === 'PATIENT' ? null : demoPatient.id,
  displayName: role === 'CAREGIVER' ? 'Rina Kalita' : role === 'HEALTH_WORKER' ? 'Mousumi Das' : demoPatient.displayName,
});

/** Synchronous: the demo session for this render, or null when not in demo mode. */
export function useDevBypass(): MeResponse | null {
  const role = getDemoRole();
  return role ? demoMe(role) : null;
}
