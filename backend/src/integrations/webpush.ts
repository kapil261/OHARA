import webpush from 'web-push';
import { env, features } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

if (features.push) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
}

type Target = { userIds?: string[]; deviceIds?: string[] };

/** Send to all subscriptions of the given users/devices. No-op without VAPID keys. Prunes dead endpoints. */
export async function pushTo(target: Target, payload: PushPayload): Promise<number> {
  if (!features.push) return 0;
  const or = [
    ...(target.userIds?.length ? [{ userId: { in: target.userIds } }] : []),
    ...(target.deviceIds?.length ? [{ deviceId: { in: target.deviceIds } }] : []),
  ];
  if (!or.length) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { OR: or } });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else logger.error({ status: code, err: (err as Error).message }, 'push send failed');
      }
    }),
  );
  return sent;
}
