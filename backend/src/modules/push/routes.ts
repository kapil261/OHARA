import { Router } from 'express';
import { z } from 'zod';
import { env, features } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { unavailable } from '../../utils/errors.js';

export const pushRouter = Router();

const subscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

pushRouter.get('/push/public-key', (_req, res) => {
  res.json({ enabled: features.push, publicKey: features.push ? env.VAPID_PUBLIC_KEY : null });
});

/** Register this browser for push. Linked to the user or the patient device, whichever is signed in. */
pushRouter.post('/push/subscribe', requireAuth, async (req, res) => {
  if (!features.push) throw unavailable('PUSH_NOT_CONFIGURED', 'Push notifications are not set up on this server');
  const body = parse(subscription, req.body);
  const owner = req.auth!.kind === 'device' ? { deviceId: req.auth!.sub, userId: null } : { userId: req.auth!.sub, deviceId: null };
  await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, ...owner },
    update: { p256dh: body.keys.p256dh, auth: body.keys.auth, ...owner },
  });
  res.status(201).json({ ok: true });
});

pushRouter.post('/push/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = parse(z.object({ endpoint: z.string().max(1000) }), req.body);
  const owner = req.auth!.kind === 'device' ? { deviceId: req.auth!.sub } : { userId: req.auth!.sub };
  await prisma.pushSubscription.deleteMany({ where: { endpoint, ...owner } });
  res.json({ ok: true });
});
