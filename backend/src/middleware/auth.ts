import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken, type TokenPayload } from '../lib/tokens.js';
import { forbidden, unauthenticated } from '../utils/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: TokenPayload;
      access?: { patientId: string; permissions: string[]; isOwner: boolean; viaDevice: boolean };
    }
  }
}

const SEEN_THROTTLE_MS = 5 * 60_000;

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthenticated();
  const payload = verifyAccessToken(header.slice(7));

  if (payload.kind === 'device') {
    // Device tokens are long-lived, so check revocation on every request.
    const device = await prisma.device.findUnique({ where: { id: payload.sub } });
    if (!device || device.revokedAt) throw unauthenticated('This device has been unpaired');
    // The patient app may send X-App-Version / X-Device-Model so the Device page stays current.
    const appVersion = req.get('x-app-version')?.slice(0, 20);
    const model = req.get('x-device-model')?.slice(0, 60);
    const infoChanged = (appVersion && appVersion !== device.appVersion) || (model && model !== device.model);
    if (infoChanged || !device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > SEEN_THROTTLE_MS) {
      await prisma.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date(), ...(appVersion ? { appVersion } : {}), ...(model ? { model } : {}) },
      });
    }
  }

  req.auth = payload;
  next();
}

export const requireUser = (req: Request, _res: Response, next: NextFunction) => {
  if (req.auth?.kind !== 'user') throw forbidden('This action needs a caregiver account');
  next();
};

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw unauthenticated();
    if (req.auth.role !== 'ADMIN' && !roles.includes(req.auth.role)) throw forbidden();
    next();
  };
