import type { AlertType, Prisma, Severity } from '@prisma/client';
import { env } from '../../config/env.js';
import { pushTo } from '../../integrations/webpush.js';
import { hasConsent } from '../../lib/consent.js';
import { emailTeam, smsTeam } from '../../lib/notify.js';
import { prisma } from '../../lib/prisma.js';
import { notifiableTeam } from '../common.js';

interface NewAlert {
  patientId: string;
  type: AlertType;
  severity: Severity;
  title: string;
  detail?: string;
  clientId?: string;
  at?: Date;
  location?: Prisma.InputJsonValue;
  occurrenceId?: string;
  deviceId?: string;
}

/**
 * Create an alert and notify the care team: push always; email for CRITICAL alerts
 * (or when `email` is set); SMS when `sms` is set (SOS). Every email / SMS is logged.
 * Idempotent by clientId so offline SOS retries never double-alert.
 */
export async function raiseAlert(input: NewAlert, opts: { email?: boolean; sms?: boolean } = {}) {
  if (input.clientId) {
    const dup = await prisma.alert.findUnique({ where: { clientId: input.clientId } });
    if (dup) return { alert: dup, duplicate: true };
  }
  const alert = await prisma.alert.create({
    data: {
      patientId: input.patientId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      detail: input.detail ?? '',
      clientId: input.clientId,
      createdAt: input.at,
      location: input.location,
      occurrenceId: input.occurrenceId,
      deviceId: input.deviceId,
    },
  });

  const team = await notifiableTeam(input.patientId);
  const patient = await prisma.patient.findUnique({ where: { id: input.patientId }, select: { displayName: true } });
  const name = patient?.displayName ?? 'Your patient';
  const url = `${env.APP_URL.replace(/\/$/, '')}/caregiver`;
  const ctx = { patientId: input.patientId, alertId: alert.id };

  await pushTo({ userIds: team.userIds }, { title: `${name}: ${alert.title}`, body: alert.detail || alert.title, tag: `alert-${alert.id}`, url, data: { alertId: alert.id } });

  if (opts.sms && team.phones.length) await smsTeam(ctx, team.phones, name, alert.title);
  if ((opts.email ?? input.severity === 'CRITICAL') && team.emails.length) {
    const lines = [alert.detail || alert.title, `Time: ${alert.createdAt.toLocaleString('en-IN', { timeZone: env.DEFAULT_TIMEZONE })}`];
    await emailTeam(ctx, team.emails, `[OHARA] ${name}: ${alert.title}`, lines, { label: 'Open OHARA', url });
  }
  return { alert, duplicate: false };
}

export interface SosLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

/** SOS from the patient device: push + SMS + email at once. Location is kept only with location consent. */
export async function raiseSos(patientId: string, clientId?: string, at?: Date, note?: string, location?: SosLocation) {
  const loc = location && (await hasConsent(patientId, 'location')) ? location : undefined;
  const where = loc ? ` Location: https://maps.google.com/?q=${loc.lat},${loc.lng}` : '';
  return raiseAlert(
    {
      patientId,
      type: 'SOS',
      severity: 'CRITICAL',
      title: 'SOS pressed',
      detail: `${note ?? 'The help button was pressed on the patient screen. Please call now.'}${where}`,
      clientId,
      at,
      location: loc ? { ...loc } : undefined,
    },
    { email: true, sms: true },
  );
}
