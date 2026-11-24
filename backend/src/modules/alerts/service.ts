import type { AlertType, Severity } from '@prisma/client';
import { env } from '../../config/env.js';
import { sendMail, simpleHtml } from '../../integrations/mailer.js';
import { pushTo } from '../../integrations/webpush.js';
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
}

/**
 * Create an alert and notify the care team (push now; email for CRITICAL alerts).
 * Idempotent by clientId so offline SOS retries never double-alert.
 */
export async function raiseAlert(input: NewAlert, opts: { email?: boolean } = {}) {
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
    },
  });

  const team = await notifiableTeam(input.patientId);
  const patient = await prisma.patient.findUnique({ where: { id: input.patientId }, select: { displayName: true } });
  const name = patient?.displayName ?? 'Your patient';
  const url = `${env.APP_URL.replace(/\/$/, '')}/caregiver`;

  await pushTo({ userIds: team.userIds }, { title: `${name}: ${alert.title}`, body: alert.detail || alert.title, tag: `alert-${alert.id}`, url, data: { alertId: alert.id } });

  if ((opts.email ?? input.severity === 'CRITICAL') && team.emails.length) {
    const subject = `[OHARA] ${name}: ${alert.title}`;
    const lines = [alert.detail || alert.title, `Time: ${alert.createdAt.toLocaleString('en-IN', { timeZone: env.DEFAULT_TIMEZONE })}`];
    await sendMail({ to: team.emails, subject, text: lines.join('\n') + `\n\nOpen OHARA: ${url}`, html: simpleHtml(subject, lines, { label: 'Open OHARA', url }) });
  }
  return { alert, duplicate: false };
}

/** SOS from the patient device. */
export const raiseSos = (patientId: string, clientId?: string, at?: Date, note?: string) =>
  raiseAlert(
    { patientId, type: 'SOS', severity: 'CRITICAL', title: 'SOS pressed', detail: note ?? 'The help button was pressed on the patient screen. Please call now.', clientId, at },
    { email: true },
  );
