import type { NotificationChannel } from '@prisma/client';
import { sendMail, simpleHtml } from '../integrations/mailer.js';
import { sendAlertSms } from '../integrations/sms.js';
import { maskContact } from '../utils/contact.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

interface Ctx {
  patientId: string;
  alertId?: string | null;
}

async function log(ctx: Ctx, channel: NotificationChannel, recipient: string, ok: boolean, error?: string) {
  try {
    await prisma.notificationLog.create({
      data: { patientId: ctx.patientId, alertId: ctx.alertId ?? null, channel, recipient: maskContact(recipient), ok, error },
    });
  } catch (err) {
    logger.error({ err }, 'notification log write failed');
  }
}

/** Email the given addresses (one message each, so one bad address cannot block the rest) and log every send. */
export async function emailTeam(ctx: Ctx, emails: string[], subject: string, lines: string[], cta?: { label: string; url: string }) {
  let sent = 0;
  for (const to of emails) {
    const ok = await sendMail({
      to,
      subject,
      text: `${lines.join('\n')}${cta ? `\n\n${cta.label}: ${cta.url}` : ''}`,
      html: simpleHtml(subject, lines, cta),
    });
    await log(ctx, 'EMAIL', to, ok, ok ? undefined : 'not delivered (SMTP missing or failed)');
    if (ok) sent++;
  }
  return sent;
}

/** SMS the given numbers through the alert template and log every send. */
export async function smsTeam(ctx: Ctx, phones: string[], patientName: string, text: string) {
  let sent = 0;
  for (const to of phones) {
    const ok = await sendAlertSms(to, patientName, text);
    await log(ctx, 'SMS', to, ok, ok ? undefined : 'not delivered (MSG91 missing or failed)');
    if (ok) sent++;
  }
  return sent;
}
