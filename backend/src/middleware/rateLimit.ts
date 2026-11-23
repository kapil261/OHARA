import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env.js';

const make = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: 'RATE_LIMITED', message } });
    },
  });

export const apiLimiter = make(60_000, 300, 'Too many requests, slow down a little');
export const otpLimiter = make(15 * 60_000, 5, 'Too many code requests. Try again in 15 minutes.');
export const authLimiter = make(15 * 60_000, 30, 'Too many sign-in attempts. Try again later.');
export const pairingLimiter = make(60_000, 60, 'Too many pairing requests');
