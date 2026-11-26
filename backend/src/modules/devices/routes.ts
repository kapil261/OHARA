import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth, requireUser } from '../../middleware/auth.js';
import { pairClaimLimiter, pairingLimiter } from '../../middleware/rateLimit.js';
import { numericCode, pairingCode, randomToken, safeEqualHex, sha256 } from '../../utils/crypto.js';
import { AppError, notFound, unauthenticated } from '../../utils/errors.js';
import { buildMe } from '../me/service.js';

/**
 * Pairing flow (no login on the elder's device):
 * 1. Device: POST /devices/pairing -> shows the 5-letter code, keeps the secret.
 * 2. Caregiver: POST /patients/:id/devices/pair { code }.
 * 3. Device polls GET /devices/pairing/:code?secret=... until it receives { token, me }.
 *
 * Or the flow from the design docs (caregiver generates, elder types):
 * 1. Caregiver: POST /patients/:id/devices/codes -> 6-digit code, valid 10 min, single use; cancels older codes.
 * 2. Device: POST /devices/pair/claim { code, model?, appVersion? } -> { token, me }.
 */
export const devicesRouter = Router();
const PAIRING_TTL_MS = 10 * 60_000;

const deviceInfo = { model: z.string().trim().max(60).optional(), appVersion: z.string().trim().max(20).optional() };
const caregiverCodeKey = (digits: string) => sha256(`pair:${digits}`);

const deviceDto = (d: { id: string; label: string | null; model: string | null; appVersion: string | null; lastSeenAt: Date | null; createdAt: Date }) => ({
  id: d.id,
  label: d.label,
  model: d.model,
  appVersion: d.appVersion,
  lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
  pairedAt: d.createdAt.toISOString(),
  createdAt: d.createdAt.toISOString(),
});

devicesRouter.post('/devices/pairing', pairingLimiter, async (req, res) => {
  const info = parse(z.object(deviceInfo), req.body ?? {});
  const deviceSecret = randomToken(24);
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  for (let i = 0; i < 5; i++) {
    const code = pairingCode();
    try {
      await prisma.pairingCode.create({ data: { code, secretHash: sha256(deviceSecret), expiresAt, deviceModel: info.model, appVersion: info.appVersion } });
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
  const device = await prisma.device.create({
    data: { patientId, label: body.label ?? 'Patient device', model: pc.deviceModel, appVersion: pc.appVersion, lastSeenAt: new Date() },
  });
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
  res.status(201).json(deviceDto(device));
});

/** Caregiver generates a 6-digit code for the elder to type. A new code cancels any older unused one. */
devicesRouter.post('/patients/:patientId/devices/codes', requireAuth, requireUser, requirePatientAccess('manage_team'), async (req, res) => {
  const patientId = req.access!.patientId;
  const now = new Date();
  await prisma.pairingCode.updateMany({ where: { patientId, createdById: { not: null }, claimedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
  for (let i = 0; i < 5; i++) {
    const code = numericCode(6);
    try {
      // Only a hash is stored, so a database leak does not reveal live codes.
      await prisma.pairingCode.create({ data: { code: caregiverCodeKey(code), secretHash: '', expiresAt, patientId, createdById: req.auth!.sub } });
      await audit('device.code_created', { actorId: req.auth!.sub, patientId });
      return res.status(201).json({ code, expiresAt: expiresAt.toISOString(), expiresInSec: PAIRING_TTL_MS / 1000 });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }
  throw new AppError(503, 'PAIRING_BUSY', 'Could not create a pairing code, please try again');
});

/** The elder's phone claims a caregiver code and receives its device token straight away. */
devicesRouter.post('/devices/pair/claim', pairClaimLimiter, async (req, res) => {
  const body = parse(z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'), label: z.string().max(60).optional(), ...deviceInfo }), req.body);
  const pc = await prisma.pairingCode.findUnique({ where: { code: caregiverCodeKey(body.code) } });
  if (!pc || !pc.patientId || !pc.createdById || pc.expiresAt < new Date() || pc.claimedAt) {
    throw new AppError(400, 'PAIRING_INVALID', 'That code is wrong or has expired. Ask your family for a new code.');
  }
  const patient = await prisma.patient.findFirst({ where: { id: pc.patientId, deletedAt: null }, select: { id: true } });
  if (!patient) throw new AppError(400, 'PAIRING_INVALID', 'That code is wrong or has expired. Ask your family for a new code.');
  const device = await prisma.device.create({
    data: { patientId: pc.patientId, label: body.label ?? 'Patient device', model: body.model, appVersion: body.appVersion, lastSeenAt: new Date() },
  });
  const claimed = await prisma.pairingCode.updateMany({
    where: { id: pc.id, claimedAt: null },
    data: { claimedAt: new Date(), deliveredAt: new Date(), deviceId: device.id },
  });
  if (claimed.count === 0) {
    await prisma.device.delete({ where: { id: device.id } });
    throw new AppError(400, 'PAIRING_INVALID', 'That code was already used');
  }
  await audit('device.paired', { actorId: pc.createdById, patientId: pc.patientId, meta: { deviceId: device.id, via: 'caregiver_code' } });
  const auth = { sub: device.id, kind: 'device' as const, role: 'PATIENT' as const, patientId: pc.patientId };
  res.status(201).json({ status: 'paired', token: signAccessToken(auth), me: await buildMe(auth) });
});

devicesRouter.get('/patients/:patientId/devices', requireAuth, requireUser, requirePatientAccess('view'), async (req, res) => {
  const devices = await prisma.device.findMany({ where: { patientId: req.access!.patientId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
  res.json(devices.map(deviceDto));
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
