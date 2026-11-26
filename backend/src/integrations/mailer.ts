import nodemailer, { type Transporter } from 'nodemailer';
import { env, features, isProd, isTest } from '../config/env.js';
import { logger } from '../lib/logger.js';

let transporter: Transporter | null = null;
function getTransport(): Transporter | null {
  if (!features.smtp) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export interface Mail {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email. Without SMTP configured (local dev only; production refuses to start)
 * the message is printed to the console instead, so OTP codes and alerts are still visible.
 * Message contents are never logged in production.
 * Returns true when it was handed to SMTP.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const to = Array.isArray(mail.to) ? mail.to.join(', ') : mail.to;
  if (!to) return false;
  const t = getTransport();
  if (!t) {
    if (!isProd && !isTest) console.log(`\n[mail:console] To: ${to}\nSubject: ${mail.subject}\n${mail.text}\n`);
    return false;
  }
  try {
    await t.sendMail({ from: env.MAIL_FROM, to, subject: mail.subject, text: mail.text, html: mail.html });
    return true;
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'mail send failed');
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Minimal, readable HTML wrapper used by all transactional mails. */
export function simpleHtml(title: string, lines: string[], cta?: { label: string; url: string }) {
  const body = lines.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join('');
  const button = cta
    ? `<p><a href="${esc(cta.url)}" style="display:inline-block;padding:10px 18px;background:#6d28d9;color:#fff;border-radius:8px;text-decoration:none">${esc(cta.label)}</a></p>`
    : '';
  return `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#1f2937;max-width:520px"><h2 style="margin:0 0 16px">${esc(title)}</h2>${body}${button}<p style="color:#6b7280;font-size:13px">OHARA care companion</p></div>`;
}
