import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ consent: { findMany: vi.fn() } }));
vi.mock('../src/lib/prisma.js', () => ({ prisma: db }));

const { consentStatus, requireConsent } = await import('../src/lib/consent.js');

const active = (...scopes: string[]) => db.consent.findMany.mockResolvedValue(scopes.map((scope) => ({ scope })));

beforeEach(() => vi.resetAllMocks());

describe('consent', () => {
  it('blanket care_data covers reminders, games and analytics, but never location', async () => {
    active('care_data');
    expect(await consentStatus('p1')).toEqual({ care_data: true, reminders: true, games: true, analytics: true, location: false });
  });

  it('only revoked-free rows count', async () => {
    active();
    await consentStatus('p1');
    expect(db.consent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: 'p1', revokedAt: null } }));
  });

  it('individual scopes work without the blanket', async () => {
    active('games', 'location');
    expect(await consentStatus('p1')).toMatchObject({ games: true, analytics: false, reminders: false, location: true });
  });

  it('requireConsent throws 403 CONSENT_REQUIRED with the scope', async () => {
    active('games');
    await expect(requireConsent('p1', 'analytics')).rejects.toMatchObject({ status: 403, code: 'CONSENT_REQUIRED', details: { scope: 'analytics' } });
    await expect(requireConsent('p1', 'games')).resolves.toBeUndefined();
  });
});
