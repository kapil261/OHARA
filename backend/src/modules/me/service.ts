import { prisma } from '../../lib/prisma.js';
import type { TokenPayload } from '../../lib/tokens.js';
import { ALL_PERMISSIONS } from '../../middleware/access.js';
import { notFound, unauthenticated } from '../../utils/errors.js';
import { userLabel } from '../../utils/contact.js';
import { patientDto } from '../common.js';

/** Builds the /me payload (frontend MeResponse) for a user or a paired device. */
export async function buildMe(auth: TokenPayload) {
  if (auth.kind === 'device') {
    const device = await prisma.device.findUnique({ where: { id: auth.sub }, include: { patient: true } });
    if (!device || device.revokedAt || device.patient.deletedAt) throw unauthenticated('This device has been unpaired');
    const patient = await patientDto(device.patient);
    return {
      role: 'PATIENT' as const,
      patientId: device.patientId,
      patient,
      permissions: [] as string[],
      onboardingCompleted: true,
      actingPatientId: device.patientId,
      displayName: device.patient.displayName,
    };
  }

  const user = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!user) throw notFound('User');
  const memberships = await prisma.careTeamMember.findMany({
    where: { userId: user.id, patient: { deletedAt: null } },
    include: { patient: true },
    orderBy: { createdAt: 'asc' },
  });
  const active = memberships.find((m) => m.patientId === user.activePatientId) ?? memberships[0] ?? null;
  const permissions = user.role === 'ADMIN' || active?.isOwner ? [...ALL_PERMISSIONS] : (active?.permissions ?? []);

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    patientId: active?.patientId ?? null,
    patient: active ? await patientDto(active.patient) : null,
    permissions,
    // Health workers see a list of patients; they do not need to create one.
    onboardingCompleted: user.role === 'HEALTH_WORKER' || user.role === 'ADMIN' || memberships.length > 0,
    actingPatientId: active?.patientId ?? null,
    displayName: userLabel(user),
    patients: memberships.map((m) => ({ id: m.patientId, displayName: m.patient.displayName, isOwner: m.isOwner })),
  };
}
