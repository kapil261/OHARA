import { create } from 'zustand';
import type { MeResponse, Permission, Role } from '../types';

interface AuthState {
  token: string | null;          // in-memory only
  role: Role | null;
  patientId: string | null;       // the patient this session is acting for
  actingPatientId: string | null; // caregiver/health-worker context
  permissions: Permission[];
  onboardingCompleted: boolean;
  hydrated: boolean;

  setAuth: (me: MeResponse, token: string) => void;
  setPatientContext: (patientId: string) => void;
  hasPermission: (p: Permission) => boolean;
  clearAuth: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  role: null,
  patientId: null,
  actingPatientId: null,
  permissions: [],
  onboardingCompleted: false,
  hydrated: false,

  setAuth: (me, token) =>
    set({
      token,
      role: me.role,
      patientId: me.patientId,
      actingPatientId: me.actingPatientId ?? null,
      permissions: me.permissions,
      onboardingCompleted: me.onboardingCompleted,
    }),

  setPatientContext: (patientId) => set({ patientId, actingPatientId: patientId }),

  hasPermission: (p) => get().permissions.includes(p),

  clearAuth: () =>
    set({
      token: null,
      role: null,
      patientId: null,
      permissions: [],
      onboardingCompleted: false,
    }),

  setHydrated: () => set({ hydrated: true }),
}));