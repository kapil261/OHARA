import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';
import { unauthenticated } from '../utils/errors.js';

export interface TokenPayload {
  sub: string; // user id, or device id when kind = 'device'
  kind: 'user' | 'device';
  role: Role;
  patientId: string | null;
}

export function signAccessToken(payload: TokenPayload): string {
  const expiresIn = (payload.kind === 'device' ? `${env.DEVICE_TOKEN_DAYS}d` : env.ACCESS_TOKEN_TTL) as SignOptions['expiresIn'];
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn, issuer: 'ohara' });
}

export function verifyAccessToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'ohara' }) as jwt.JwtPayload & TokenPayload;
    return { sub: decoded.sub, kind: decoded.kind, role: decoded.role, patientId: decoded.patientId ?? null };
  } catch {
    throw unauthenticated('Session expired, please sign in again');
  }
}
