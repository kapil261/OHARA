import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth, requireUser } from '../../middleware/auth.js';
import { pairingLimiter } from '../../middleware/rateLimit.js';
import { pairingCode, randomToken, safeEqualHex, sha256 } from '../../utils/crypto.js';
import { AppError, notFound, unauthenticated } from '../../utils/errors.js';
import { buildMe } from '../me/service.js';

/**
 * Pairing flow (no login on the elder's device):
 * 1. Device: POST /devices/pairing -> shows the 5-letter code, keeps the secret.
 * 2. Caregiver: POST /patients/:id/devices/pair { code }.
 * 3. Device polls GET /devices/pairing/:code?secret=... until it receives { token, me }.
 */
export const devicesRouter = Router();
const PAIRING_TTL_MS = 10 * 60_000;

devicesRouter.post('/devices/pairing', pairingLimiter, async (_req, res) => {
  const deviceSecret = randomToken(24);
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  for (let i = 0; i < 5; i++) {
    const code = pairingCode();
    try {
      await prisma.pairingCode.create({ data: { code, secretHash: sha256(deviceSecret), expiresAt } });
      return res.status(201).json({ code, deviceSecret, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }
  throw new AppError(503, 'PAIRING_BUSY', 'Could not create a pairing code, please try again');
});

devicesRouter.get('/devices/pairing/:code', pairingLimiter, async (req, res) => {
  const secret = String(req.query.secret ?? '');
  const pc = await prisma.pairingCode.findUnique({ where: { code: String(req.params.code).toUpperCase() } });
  if (!pc || !secret || !safeEqualHex(pc.secretHash, sha256(secret))) throw notFound('Pairing code');
  if (!pc.deviceId || !pc.patientId) {
    if (pc.expiresAt < new Date()) throw new AppError(410, 'PAIRING_EXPIRED', 'This code has expired. Start pairing again.');
    return res.json({ status: 'waiting', expiresAt: pc.expiresAt.toISOString() });
  }
  if (pc.deliveredAt) throw unauthenticated('This pairing was already used. Start pairing again.');
  await prisma.pairingCode.update({ where: { id: pc.id }, data: { deliveredAt: new Date() } });
  const token = signAccessToken({ sub: pc.deviceId, kind: 'device', role: 'PATIENT', patientId: pc.patientId });
  const me = await buildMe({ sub: pc.deviceId, kind: 'device', role: 'PATIENT', patientId: pc.patientId });
  res.json({ status: 'paired', token, me });
});

devicesRouter.post('/patients/:patientId/devices/pair', requireAuth, requireUser, requirePatientAccess('manage_team'), async (req, res) => {
  const body = parse(z.object({ code: z.string().trim().min(4).max(8), label: z.string().max(60).optional() }), req.body);
  const patientId = req.access!.patientId;
  const pc = await prisma.pairingCode.findUnique({ where: { code: body.code.toUpperCase() } });
  if (!pc || pc.expiresAt < new Date() || pc.claimedAt) throw new AppError(400, 'PAIRING_INVALID', 'That code is wrong or has expired');
  const device = await prisma.device.create({ data: { patientId, label: body.label ?? 'Patient device' } });
  // Conditional update guards against two caregivers claiming the same code at once.
  const claimed = await prisma.pairingCode.updateMany({
    where: { id: pc.id, claimedAt: null },
    data: { claimedAt: new Date(), patientId, deviceId: device.id },
  });
  if (claimed.count === 0) {
    await prisma.device.delete({ where: { id: device.id } });
    throw new AppError(400, 'PAIRING_INVALID', 'That code was already used');
  }
  await audit('device.paired', { actorId: req.auth!.sub, patientId, meta: { deviceId: device.id } });
  res.status(201).json({ id: device.id, label: device.label, createdAt: device.createdAt.toISOString() });
});

devicesRouter.get('/patients/:patientId/devices', requireAuth, requireUser, requirePatientAccess('view'), async (req, res) => {
  const devices = await prisma.device.findMany({ where: { patientId: req.access!.patientId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
  res.json(devices.map((d) => ({ id: d.id, label: d.label, lastSeenAt: d.lastSeenAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString() })));
});

devicesRouter.delete('/patients/:patientId/devices/:deviceId', requireAuth, requireUser, requirePatientAccess('manage_team'), async (req, res) => {
  const r = await prisma.device.updateMany({
    where: { id: String(req.params.deviceId), patientId: req.access!.patientId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!r.count) throw notFound('Device');
  await prisma.pushSubscription.deleteMany({ where: { deviceId: String(req.params.deviceId) } });
  await audit('device.revoked', { actorId: req.auth!.sub, patientId: req.access!.patientId, meta: { deviceId: req.params.deviceId } });
  res.status(204).end();
});
