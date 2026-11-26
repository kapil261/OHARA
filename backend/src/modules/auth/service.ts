import type { Response } from 'express';
import { env, features, isProd } from '../../config/env.js';
import { sendMail, simpleHtml } from '../../integrations/mailer.js';
import { sendOtpSms } from '../../integrations/sms.js';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { normalizeEmail, normalizePhone } from '../../utils/contact.js';
import { otpCode, randomToken, safeEqualHex, sha256 } from '../../utils/crypto.js';
import { AppError, badRequest, tooMany, unauthenticated, unavailable } from '../../utils/errors.js';

export const REFRESH_COOKIE = 'ohara_rt';
const OTP_PER_HOUR = 5;

export { normalizeEmail };

/** Where a sign-in code goes. A bare string is treated as an email (original API). */
export type Contact = string | { email: string } | { phone: string };

function resolveContact(c: Contact): { channel: 'email' | 'phone'; identifier: string } {
  if (typeof c === 'string') return { channel: 'email', identifier: normalizeEmail(c) };
  if ('email' in c) return { channel: 'email', identifier: normalizeEmail(c.email) };
  const phone = normalizePhone(c.phone);
  if (!phone) throw badRequest('Enter a valid Indian mobile number');
  return { channel: 'phone', identifier: phone };
}

export async function requestOtp(contact: Contact) {
  const { channel, identifier } = resolveContact(contact);
  // In production a channel without a provider would silently drop the code.
  if (isProd && channel === 'phone' && !features.sms) throw unavailable('SMS_NOT_CONFIGURED', 'Sign-in by SMS is not available. Please use email.');
  if (isProd && channel === 'email' && !features.smtp) throw unavailable('EMAIL_NOT_CONFIGURED', 'Sign-in by email is not available. Please use your mobile number.');

  const since = new Date(Date.now() - 60 * 60_000);
  const recent = await prisma.otpCode.count({ where: { identifier, createdAt: { gte: since } } });
  if (recent >= OTP_PER_HOUR) throw tooMany('Too many codes requested. Please wait a while and try again.');

  const code = otpCode();
  // Only one live code at a time.
  await prisma.otpCode.updateMany({ where: { identifier, consumed: false }, data: { consumed: true } });
  await prisma.otpCode.create({
    data: { identifier, codeHash: sha256(`${identifier}:${code}`), expiresAt: new Date(Date.now() + env.OTP_TTL_MIN * 60_000) },
  });
  if (channel === 'phone') {
    await sendOtpSms(identifier, code, env.OTP_TTL_MIN);
  } else {
    await sendMail({
      to: identifier,
      subject: `Your OHARA sign-in code: ${code}`,
      text: `Your OHARA sign-in code is ${code}. It expires in ${env.OTP_TTL_MIN} minutes. If you did not ask for this, ignore this email.`,
      html: simpleHtml('Your sign-in code', [
        `Use this code to sign in to OHARA: ${code}`,
        `It expires in ${env.OTP_TTL_MIN} minutes. If you did not ask for this, you can ignore this email.`,
      ]),
    });
  }
  return { sent: true, channel, expiresInSec: env.OTP_TTL_MIN * 60 };
}

export async function verifyOtp(contact: Contact, code: string) {
  const { channel, identifier } = await checkOtp(contact, code);
  const key = channel === 'phone' ? { phone: identifier } : { email: identifier };
  const user = await prisma.user.upsert({
    where: key,
    create: { ...key, lastLoginAt: new Date() },
    update: { lastLoginAt: new Date() },
  });
  await audit('auth.login', { actorId: user.id, meta: { method: channel === 'phone' ? 'sms_otp' : 'email_otp' } });
  return user;
}

/** Check and consume a code for `contact`. Throws on a wrong, expired or exhausted code. */
export async function checkOtp(contact: Contact, code: string) {
  const resolved = resolveContact(contact);
  const { identifier } = resolved;
  const otp = await prisma.otpCode.findFirst({ where: { identifier, consumed: false }, orderBy: { createdAt: 'desc' } });
  if (!otp || otp.expiresAt < new Date()) throw badRequest('This code has expired. Please request a new one.');
  // Claim an attempt atomically so parallel guesses cannot exceed OTP_MAX_ATTEMPTS.
  const claimed = await prisma.otpCode.updateMany({
    where: { id: otp.id, consumed: false, attempts: { lt: env.OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (!claimed.count) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { consumed: true } });
    throw tooMany('Too many wrong attempts. Please request a new code.');
  }
  if (!safeEqualHex(otp.codeHash, sha256(`${identifier}:${code}`))) {
    throw new AppError(400, 'INVALID_OTP', 'That code is not right. Please check and try again.');
  }
  // Consume atomically so the same code cannot sign in twice.
  const consumed = await prisma.otpCode.updateMany({ where: { id: otp.id, consumed: false }, data: { consumed: true } });
  if (!consumed.count) throw badRequest('This code has already been used. Please request a new one.');
  return resolved;
}

export async function userAccessToken(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  let patientId = user.activePatientId;
  if (!patientId) {
    const first = await prisma.careTeamMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
    patientId = first?.patientId ?? null;
  }
  return signAccessToken({ sub: user.id, kind: 'user', role: user.role, patientId });
}

export async function issueRefreshToken(userId: string) {
  const raw = randomToken(48);
  const row = await prisma.refreshToken.create({
    data: { userId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000) },
  });
  return { raw, id: row.id };
}

/** Rotate a refresh token. Reuse of an already-rotated token revokes the whole family for safety. */
export async function rotateRefreshToken(raw: string | undefined) {
  if (!raw) throw unauthenticated();
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!row || row.expiresAt < new Date()) throw unauthenticated('Session expired, please sign in again');
  if (row.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw unauthenticated('Session expired, please sign in again');
  }
  const next = await issueRefreshToken(row.userId);
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date(), replacedBy: next.id } });
  return { userId: row.userId, raw: next.raw };
}

export async function revokeRefreshToken(raw: string | undefined) {
  if (!raw) return;
  await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
}

export function setRefreshCookie(res: Response, raw: string) {
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,
    secure: isProd,
    // Frontend and API are usually on different free hosts in prod (e.g. Vercel + Render).
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000,
  });
}

export const clearRefreshCookie = (res: Response) =>
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth', httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax' });
