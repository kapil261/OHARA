import { env, features, isProd } from '../config/env.js';

/**
 * Client for the optional ML service (FastAPI in ai/). Every call returns null when
 * ML_URL is blank, the service is down, or it times out; callers then use local heuristics.
 */
async function call<T>(path: string, body: unknown): Promise<T | null> {
  if (!features.ml) return null;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = env.ML_API_KEY || (!isProd ? 'dev-only-ml-secret-key' : undefined);
    if (key) {
      headers['X-ML-Key'] = key;
    }

    const res = await fetch(`${env.ML_URL!.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(env.ML_TIMEOUT_MS),
    });
    if (!res.ok) {
      if (res.status === 401) {
        console.warn(`[ml] ML auth failed: check ML_API_KEY (endpoint ${path} returned 401 Unauthorized)`);
      } else {
        console.warn(`[ml] ${path} returned HTTP ${res.status}: ${res.statusText}`);
      }
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[ml] ${path} unavailable, using local fallback:`, (err as Error).message);
    return null;
  }
}

export interface DifficultyIn {
  patientId: string;
  gameId: string;
  level: number;
  accuracy: number;
  responseTimeMs: number;
  hintsUsed: number;
}
export const mlDifficulty = (input: DifficultyIn) => call<{ level: number }>('/difficulty', input);

export interface BaselineMetricIn {
  median?: number;
  ewma: number;
  std: number;
  count?: number;
  sampleSize?: number;
}

export interface DeclineIn {
  patientId: string;
  sessions: { accuracy: number; responseTimeMs: number; playedAt?: string }[];
  baseline?: Record<string, BaselineMetricIn>;
}
export const mlDecline = (input: DeclineIn) => call<{ decline: boolean; score?: number; reason?: string }>('/decline', input);
