/** Email / phone helpers shared by sign-in, team invites and notifications. */

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

const INDIAN_MOBILE = /^(?:\+?91|0)?([6-9]\d{9})$/;

/** Normalise an Indian mobile number to E.164 ("+919876543210"), or null if it is not one. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, '');
  const m = INDIAN_MOBILE.exec(digits);
  return m ? `+91${m[1]}` : null;
}

/** For logs and the notification log: "ri***@example.com", "+91******3210". */
export function maskContact(value: string): string {
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return `${value.slice(0, 3)}${'*'.repeat(Math.max(0, value.length - 7))}${value.slice(-4)}`;
}

/** Friendly name for a user who may have only an email or only a phone. */
export const userLabel = (u: { name?: string | null; email?: string | null; phone?: string | null }) =>
  u.name ?? u.email?.split('@')[0] ?? (u.phone ? maskContact(u.phone) : 'Someone');
