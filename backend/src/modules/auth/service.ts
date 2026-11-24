import type { Response } from 'express';
import { env, isProd } from '../../config/env.js';
import { sendMail, simpleHtml } from '../../integrations/mailer.js';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { otpCode, randomToken, safeEqualHex, sha256 } from '../../utils/crypto.js';
import { AppError, badRequest, tooMany, unauthenticated } from '../../utils/errors.js';

export const REFRESH_COOKIE = 'ohara_rt';
const OTP_PER_HOUR = 5;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function requestOtp(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  const since = new Date(Date.now() - 60 * 60_000);
  const recent = await prisma.otpCode.count({ where: { email, createdAt: { gte: since } } });
  if (recent >= OTP_PER_HOUR) throw tooMany('Too many codes requested. Please wait a while and try again.');

  const code = otpCode();
  // Only one live code at a time.
  await prisma.otpCode.updateMany({ where: { email, consumed: false }, data: { consumed: true } });
  await prisma.otpCode.create({
    data: { email, codeHash: sha256(`${email}:${code}`), expiresAt: new Date(Date.now() + env.OTP_TTL_MIN * 60_000) },
  });
  await sendMail({
    to: email,
    subject: `Your OHARA sign-in code: ${code}`,
    text: `Your OHARA sign-in code is ${code}. It expires in ${env.OTP_TTL_MIN} minutes. If you did not ask for this, ignore this email.`,
    html: simpleHtml('Your sign-in code', [
      `Use this code to sign in to OHARA: ${code}`,
      `It expires in ${env.OTP_TTL_MIN} minutes. If you did not ask for this, you can ignore this email.`,
    ]),
  });
  return { sent: true, expiresInSec: env.OTP_TTL_MIN * 60 };
}

export async function verifyOtp(rawEmail: string, code: string) {
  const email = normalizeEmail(rawEmail);
  const otp = await prisma.otpCode.findFirst({ where: { email, consumed: false }, orderBy: { createdAt: 'desc' } });
  if (!otp || otp.expiresAt < new Date()) throw badRequest('This code has expired. Please request a new one.');
  if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { consumed: true } });
    throw tooMany('Too many wrong attempts. Please request a new code.');
  }
  if (!safeEqualHex(otp.codeHash, sha256(`${email}:${code}`))) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new AppError(400, 'INVALID_OTP', 'That code is not right. Please check and try again.');
  }
  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumed: true } });

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, lastLoginAt: new Date() },
    update: { lastLoginAt: new Date() },
  });
  await audit('auth.login', { actorId: user.id, meta: { method: 'email_otp' } });
  return user;
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
