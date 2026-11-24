import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { forbidden, notFound, unauthenticated } from '../utils/errors.js';

export const ALL_PERMISSIONS = ['view', 'schedule', 'upload', 'export', 'delete', 'manage_team'] as const;
export type Permission = (typeof ALL_PERMISSIONS)[number];

/**
 * Guards /patients/:patientId/... routes.
 * - Care-team members need `permission` on that patient (owners and admins have all).
 * - The paired patient device passes only when `device: true` and it belongs to that patient.
 */
export const requirePatientAccess =
  (permission: Permission, opts: { device?: boolean } = {}) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) throw unauthenticated();
    const patientId = String(req.params.patientId);

    const patient = await prisma.patient.findFirst({ where: { id: patientId, deletedAt: null }, select: { id: true } });
    if (!patient) throw notFound('Patient');

    if (auth.kind === 'device') {
      if (!opts.device || auth.patientId !== patientId) throw forbidden();
      req.access = { patientId, permissions: [], isOwner: false, viaDevice: true };
      return next();
    }

    if (auth.role === 'ADMIN') {
      req.access = { patientId, permissions: [...ALL_PERMISSIONS], isOwner: false, viaDevice: false };
      return next();
    }

    const member = await prisma.careTeamMember.findUnique({ where: { patientId_userId: { patientId, userId: auth.sub } } });
    if (!member) throw forbidden('You are not on this care team');
    const perms = member.isOwner ? [...ALL_PERMISSIONS] : member.permissions;
    if (!perms.includes(permission)) throw forbidden(`You need "${permission}" access for this`);

    req.access = { patientId, permissions: perms, isOwner: member.isOwner, viaDevice: false };
    next();
  };
