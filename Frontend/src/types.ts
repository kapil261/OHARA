/** Shared types for OHARA frontend. */

export type Role = 'PATIENT' | 'CAREGIVER' | 'HEALTH_WORKER' | 'ADMIN';

/** Permissions a caregiver may hold (granular, beyond just being a caregiver). */
export type Permission =
  | 'view'
  | 'schedule'
  | 'upload'
  | 'export'
  | 'delete'
  | 'manage_team';

export interface Patient {
  id: string;
  displayName: string;
  language: string;
  timezone?: string;
  baseline?: Baseline;
  /** Recorded voice greeting played on the home screen. */
  voiceClipUrl?: string;
  /** Photo shown during reminder ringing. */
  photoUrl?: string;
}

export interface Baseline {
  accuracy: number;
  responseTimeMs: number;
  computedAt: string;
}

export interface Reminder {
  id: string;
  type: 'medicine' | 'water' | 'meal' | 'appointment';
  label: string;
  scheduledAt: string;
  voiceClipUrl?: string;
  photoUrl?: string;
  status: 'pending' | 'snoozed' | 'done';
}

export interface GameSession {
  id: string;
  gameId: string;
  level: number;
  accuracy: number;
  responseTimeMs: number;
  hintsUsed: number;
  completedAt: string;
}

export interface Alert {
  id: string;
  patientId: string;
  type: 'decline' | 'missed_dose' | 'sos';
  severity: 'info' | 'warn' | 'critical';
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

export interface CareTeamMember {
  id: string;
  name: string;
  role: 'CAREGIVER' | 'HEALTH_WORKER';
  permissions: Permission[];
}

/** The /api/me payload. Mirrors Hawkr's MeResponse shape: one shape drives all routing. */
export interface MeResponse {
  role: Role;
  patientId: string | null;
  patient: Patient | null;
  permissions: Permission[];
  onboardingCompleted: boolean;
  /** For caregivers acting on a specific patient (multi-tenant scoping). */
  actingPatientId: string | null;
  /** The display name used by the patient mode greeting. */
  displayName?: string;
}