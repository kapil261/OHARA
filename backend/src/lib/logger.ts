import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import pino from 'pino';
import { env, isProd, isTest } from '../config/env.js';

/**
 * Structured JSON logger. Personal data and secrets (emails, phone numbers, OTP codes, tokens, cookies)
 * are redacted wherever they appear as fields; never interpolate them into messages.
 */
export const logger = pino({
  level: env.LOG_LEVEL ?? (isTest ? 'silent' : isProd ? 'info' : 'debug'),
  base: { service: 'ohara-backend' },
  redact: {
    paths: [
      'email', 'phone', 'to', 'code', 'otp', 'token', 'refreshToken', 'password', 'secret',
      '*.email', '*.phone', '*.to', '*.code', '*.otp', '*.token', '*.refreshToken', '*.password', '*.secret',
      'req.headers.authorization', 'req.headers.cookie', 'req.headers["x-ml-key"]', 'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
  serializers: { err: pino.stdSerializers.err },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
      log?: pino.Logger;
    }
  }
}

const REQUEST_ID = /^[\w-]{8,64}$/;

/** Assigns a request id (honouring a sane incoming X-Request-Id), echoes it back and logs one line per request. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id');
  req.id = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.log = logger.child({ requestId: req.id });
  res.setHeader('X-Request-Id', req.id);
  const start = process.hrtime.bigint();
  // Captured now: routers rewrite req.path while handling. Path only, since query strings can carry personal data.
  const path = req.path;
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const line = { method: req.method, path, status: res.statusCode, ms: Math.round(ms) };
    if (res.statusCode >= 500) req.log!.error(line, 'request failed');
    else if (!path.startsWith('/api/health')) req.log!.info(line, 'request');
  });
  next();
}
