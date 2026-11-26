import { env, features } from '../config/env.js';
import { prisma } from './prisma.js';

export type CheckStatus = 'ok' | 'down' | 'disabled';
export interface CheckResult {
  status: CheckStatus;
  ms?: number;
  error?: string;
}

const DB_TIMEOUT_MS = 2000;

async function timed(fn: () => Promise<unknown>): Promise<CheckResult> {
  const start = Date.now();
  try {
    await fn();
    return { status: 'ok', ms: Date.now() - start };
  } catch (err) {
    return { status: 'down', ms: Date.now() - start, error: (err as Error).message.split('\n')[0].slice(0, 200) };
  }
}

export const checkDatabase = () =>
  timed(() =>
    Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${DB_TIMEOUT_MS}ms`)), DB_TIMEOUT_MS).unref()),
    ]),
  );

export async function checkMl(): Promise<CheckResult> {
  if (!features.ml) return { status: 'disabled' };
  return timed(async () => {
    const res = await fetch(`${env.ML_URL!.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(env.ML_HEALTH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

/**
 * Readiness report. The database is required (503 when down); the AI service is optional
 * because every ML call has a local fallback, so it only marks the API as "degraded".
 */
export async function healthReport() {
  const [database, ml] = await Promise.all([checkDatabase(), checkMl()]);
  const status = database.status !== 'ok' ? 'down' : ml.status === 'down' ? 'degraded' : 'ok';
  return { httpStatus: status === 'down' ? 503 : 200, body: { ok: status !== 'down', status, checks: { database, ml } } };
}
