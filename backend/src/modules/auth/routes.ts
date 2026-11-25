import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { authLimiter, otpLimiter } from '../../middleware/rateLimit.js';
import { buildMe } from '../me/service.js';
import { verifyAccessToken } from '../../lib/tokens.js';
import {
  type Contact,
  REFRESH_COOKIE,
  clearRefreshCookie,
  issueRefreshToken,
  requestOtp,
  revokeRefreshToken,
  rotateRefreshToken,
  setRefreshCookie,
  userAccessToken,
  verifyOtp,
} from './service.js';

export const authRouter = Router();

const email = z.string().trim().email('Enter a valid email address').max(254);

const phone = z.string().trim().min(10, 'Enter a valid mobile number').max(16);
// Exactly one of email / phone.
const contactBody = z
  .object({ email: email.optional(), phone: phone.optional() })
  .refine((b) => Boolean(b.email) !== Boolean(b.phone), { message: 'Enter your email or your mobile number', path: ['email'] });
const toContact = (b: { email?: string; phone?: string }): Contact => (b.phone ? { phone: b.phone } : { email: b.email! });

// `/auth/otp/send` is the path used in the design docs; both work.
authRouter.post(['/auth/otp/request', '/auth/otp/send'], otpLimiter, async (req, res) => {
  const body = parse(contactBody, req.body);
  res.json(await requestOtp(toContact(body)));
});

authRouter.post('/auth/otp/verify', authLimiter, async (req, res) => {
  const body = parse(
    z
      .object({
        email: email.optional(),
        phone: phone.optional(),
        otp: z.string().regex(/^\d{6}$/).optional(),
        code: z.string().regex(/^\d{6}$/).optional(),
      })
      .refine((b) => Boolean(b.email) !== Boolean(b.phone), { message: 'Enter your email or your mobile number', path: ['email'] })
      .refine((b) => b.otp || b.code, { message: 'Enter the 6-digit code', path: ['otp'] }),
    req.body,
  );
  const user = await verifyOtp(toContact(body), (body.otp ?? body.code)!);
  const token = await userAccessToken(user.id);
  const refresh = await issueRefreshToken(user.id);
  setRefreshCookie(res, refresh.raw);
  res.json({ token, me: await buildMe(verifyAccessToken(token)) });
});

authRouter.post('/auth/refresh', authLimiter, async (req, res) => {
  const rotated = await rotateRefreshToken(req.cookies?.[REFRESH_COOKIE]);
  setRefreshCookie(res, rotated.raw);
  const token = await userAccessToken(rotated.userId);
  res.json({ token, me: await buildMe(verifyAccessToken(token)) });
});

authRouter.post('/auth/logout', async (req, res) => {
  await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  res.status(204).end();
});
