import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { isProd } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

// Express recognises error handlers by their 4 arguments, so `_next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten().fieldErrors } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: { code: 'CONFLICT', message: 'That already exists' } });
    if (err.code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error('[db] cannot reach the database:', err.message);
    return res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database is not reachable. Check DATABASE_URL.' } });
  }
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }
  if (e?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
  }
  console.error('[error]', err);
  res.status(500).json({
    error: { code: 'INTERNAL', message: isProd ? 'Something went wrong' : String((err as Error)?.message ?? err) },
  });
}
