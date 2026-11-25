import type { Request } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  patient: { findFirst: vi.fn() },
  careTeamMember: { findUnique: vi.fn() },
  device: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock('../src/lib/prisma.js', () => ({ prisma: db }));

const { requirePatientAccess, ALL_PERMISSIONS } = await import('../src/middleware/access.js');
const { signAccessToken } = await import('../src/lib/tokens.js');
const { createApp } = await import('../src/app.js');
const app = createApp();

type Auth = NonNullable<Request['auth']>;
const user = (sub: string, role: Auth['role'] = 'CAREGIVER'): Auth => ({ sub, kind: 'user', role, patientId: null });
const device = (patientId: string): Auth => ({ sub: 'dev-1', kind: 'device', role: 'PATIENT', patientId });

async function run(mw: ReturnType<typeof requirePatientAccess>, auth: Auth | undefined, patientId = 'p1') {
  const req = { auth, params: { patientId } } as unknown as Request;
  const next = vi.fn();
  await mw(req, {} as never, next);
  return { req, next };
}

beforeEach(() => {
  vi.resetAllMocks();
  db.patient.findFirst.mockResolvedValue({ id: 'p1' });
});

describe('requirePatientAccess', () => {
  it('401 without auth', async () => {
    await expect(run(requirePatientAccess('view'), undefined)).rejects.toMatchObject({ status: 401 });
  });

  it('404 for a missing or soft-deleted patient (before any permission check)', async () => {
    db.patient.findFirst.mockResolvedValue(null);
    await expect(run(requirePatientAccess('view'), user('u1'))).rejects.toMatchObject({ status: 404 });
    expect(db.patient.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1', deletedAt: null } }));
  });

  it('403 when the user is not on the care team', async () => {
    db.careTeamMember.findUnique.mockResolvedValue(null);
    await expect(run(requirePatientAccess('view'), user('stranger'))).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('403 when a member lacks the required permission', async () => {
    db.careTeamMember.findUnique.mockResolvedValue({ isOwner: false, permissions: ['view'] });
    for (const p of ['schedule', 'upload', 'export', 'delete', 'manage_team'] as const) {
      await expect(run(requirePatientAccess(p), user('u2'))).rejects.toMatchObject({ status: 403 });
    }
  });

  it('a member with the permission passes, with exactly their permissions', async () => {
    db.careTeamMember.findUnique.mockResolvedValue({ isOwner: false, permissions: ['view', 'schedule'] });
    const { req, next } = await run(requirePatientAccess('schedule'), user('u2'));
    expect(next).toHaveBeenCalled();
    expect(req.access).toEqual({ patientId: 'p1', permissions: ['view', 'schedule'], isOwner: false, viaDevice: false });
  });

  it('the owner gets every permission regardless of the stored list', async () => {
    db.careTeamMember.findUnique.mockResolvedValue({ isOwner: true, permissions: [] });
    const { req, next } = await run(requirePatientAccess('manage_team'), user('owner'));
    expect(next).toHaveBeenCalled();
    expect(req.access?.permissions).toEqual([...ALL_PERMISSIONS]);
  });

  it('admins pass without a membership', async () => {
    const { next } = await run(requirePatientAccess('delete'), user('admin', 'ADMIN'));
    expect(next).toHaveBeenCalled();
    expect(db.careTeamMember.findUnique).not.toHaveBeenCalled();
  });

  it('403 for a device on a route that does not allow devices', async () => {
    await expect(run(requirePatientAccess('view'), device('p1'))).rejects.toMatchObject({ status: 403 });
  });

  it("403 for a device paired to a different patient", async () => {
    await expect(run(requirePatientAccess('view', { device: true }), device('other'))).rejects.toMatchObject({ status: 403 });
  });

  it('a device passes on its own patient when the route allows devices', async () => {
    const { req, next } = await run(requirePatientAccess('view', { device: true }), device('p1'));
    expect(next).toHaveBeenCalled();
    expect(req.access).toMatchObject({ viaDevice: true, permissions: [] });
  });
});

describe('permission checks through real routes', () => {
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('403 when a patient device calls a caregiver-only route', async () => {
    db.device.findUnique.mockResolvedValue({ id: 'dev-1', revokedAt: null, lastSeenAt: new Date() });
    const token = signAccessToken({ sub: 'dev-1', kind: 'device', role: 'PATIENT', patientId: 'p1' });
    const res = await request(app).get('/api/patients/p1/team').set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('401 when a revoked device uses its old token', async () => {
    db.device.findUnique.mockResolvedValue({ id: 'dev-1', revokedAt: new Date(), lastSeenAt: null });
    const token = signAccessToken({ sub: 'dev-1', kind: 'device', role: 'PATIENT', patientId: 'p1' });
    const res = await request(app).get('/api/patients/p1/sync').set(bearer(token));
    expect(res.status).toBe(401);
  });

  it('403 when a non-owner with "delete" permission tries to delete the patient', async () => {
    db.careTeamMember.findUnique.mockResolvedValue({ isOwner: false, permissions: ['view', 'delete'] });
    const token = signAccessToken({ sub: 'u2', kind: 'user', role: 'CAREGIVER', patientId: 'p1' });
    const res = await request(app).delete('/api/patients/p1').set(bearer(token));
    expect(res.status).toBe(403);
  });

  it('403 when a view-only member tries to invite someone to the team', async () => {
    db.careTeamMember.findUnique.mockResolvedValue({ isOwner: false, permissions: ['view'] });
    const token = signAccessToken({ sub: 'u2', kind: 'user', role: 'CAREGIVER', patientId: 'p1' });
    const res = await request(app).post('/api/patients/p1/team').set(bearer(token)).send({ email: 'x@example.com' });
    expect(res.status).toBe(403);
  });

  it('401 for a forged token signed with another secret', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ sub: 'u1', kind: 'user', role: 'ADMIN', patientId: null }, 'not-the-secret', { issuer: 'ohara' });
    const res = await request(app).get('/api/patients/p1/team').set(bearer(forged));
    expect(res.status).toBe(401);
  });
});
