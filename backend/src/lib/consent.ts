import { AppError } from '../utils/errors.js';
import { prisma } from './prisma.js';

/**
 * Guardian consent scopes (DPDP Act 2023). `care_data` is the blanket consent given at onboarding
 * and covers reminders, games and analytics. Location is never implied: it needs its own consent.
 */
export const CONSENT_SCOPES = ['care_data', 'reminders', 'games', 'analytics', 'location'] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

const COVERED_BY_CARE_DATA: ConsentScope[] = ['reminders', 'games', 'analytics'];

const LABEL: Record<ConsentScope, string> = {
  care_data: 'care data',
  reminders: 'reminders and responses',
  games: 'games and activity data',
  analytics: 'progress analytics',
  location: 'location for SOS',
};

/** Which scopes are currently granted for a patient. */
export async function consentStatus(patientId: string): Promise<Record<ConsentScope, boolean>> {
  const active = await prisma.consent.findMany({ where: { patientId, revokedAt: null }, select: { scope: true } });
  const granted = new Set(active.map((c) => c.scope));
  const blanket = granted.has('care_data');
  return Object.fromEntries(
    CONSENT_SCOPES.map((s) => [s, granted.has(s) || (blanket && COVERED_BY_CARE_DATA.includes(s))]),
  ) as Record<ConsentScope, boolean>;
}

export const hasConsent = async (patientId: string, scope: ConsentScope) => (await consentStatus(patientId))[scope];

/** Throws 403 CONSENT_REQUIRED unless the guardian has consented to `scope`. */
export async function requireConsent(patientId: string, scope: ConsentScope) {
  if (!(await hasConsent(patientId, scope))) {
    throw new AppError(403, 'CONSENT_REQUIRED', `Guardian consent for ${LABEL[scope]} is off for this patient. Turn it on in Settings to continue.`, { scope });
  }
}
