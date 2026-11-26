import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mlDecline, mlDifficulty } from '../src/integrations/mlClient.js';
import { logger } from '../src/lib/logger.js';
import { nextLevel } from '../src/modules/games/service.js';

describe('mlClient integration and security tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends X-ML-Key header and payload to /difficulty', async () => {
    let capturedHeaders: RequestInit['headers'];
    let capturedBody: any;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedHeaders = init?.headers;
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ level: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await mlDifficulty({
      patientId: 'patient-test-1',
      gameId: 'memory-match',
      level: 2,
      accuracy: 0.9,
      responseTimeMs: 1200,
      hintsUsed: 0,
    });

    expect(res).not.toBeNull();
    expect(res?.level).toBe(3);
    expect(capturedHeaders).toHaveProperty('X-ML-Key', 'test-ml-key');
    expect(capturedBody).toHaveProperty('patientId', 'patient-test-1');
  });

  it('sends baseline map alongside sessions to /decline', async () => {
    let capturedBody: any;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          decline: false,
          score: 0.0,
          reason: 'Metrics within normal range',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const res = await mlDecline({
      patientId: 'patient-test-1',
      sessions: [{ accuracy: 0.8, responseTimeMs: 1500, playedAt: new Date().toISOString() }],
      baseline: {
        accuracy: { median: 0.82, ewma: 0.81, std: 0.05, count: 5 },
        responseTimeMs: { median: 1600, ewma: 1550, std: 150, count: 5 },
      },
    });

    expect(res?.decline).toBe(false);
    expect(capturedBody).toHaveProperty('baseline');
    expect(capturedBody.baseline).toHaveProperty('accuracy');
    expect(capturedBody.baseline.accuracy.ewma).toBe(0.81);
  });

  it('logs prominent warning and falls back to local logic when the AI service returns 401 Unauthorized', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ detail: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    // mlDifficulty should return null on 401
    const mlRes = await mlDifficulty({
      patientId: 'p1',
      gameId: 'memory-match',
      level: 2,
      accuracy: 0.9,
      responseTimeMs: 1200,
      hintsUsed: 0,
    });
    expect(mlRes).toBeNull();
    // Confirms clear, non-silent auth warning logged
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401 }),
      expect.stringContaining('ML auth failed: check ML_API_KEY'),
    );

    // nextLevel should safely fall back to local heuristic (advancing level 2 -> 3)
    const level = await nextLevel({
      patientId: 'p1',
      gameId: 'memory-match',
      level: 2,
      accuracy: 0.95,
      responseTimeMs: 1200,
      hintsUsed: 0,
    });
    expect(level).toBe(3);
  });

  it('falls back to local logic when AI service is down or network throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const mlRes = await mlDecline({
      patientId: 'p1',
      sessions: [{ accuracy: 0.5, responseTimeMs: 4000 }],
    });
    // Never throws unhandled error; gracefully returns null
    expect(mlRes).toBeNull();

    const level = await nextLevel({
      patientId: 'p1',
      gameId: 'memory-match',
      level: 2,
      accuracy: 0.5,
      responseTimeMs: 4000,
      hintsUsed: 3,
    });
    // Local fallback decreases level from 2 -> 1 due to low accuracy and hints
    expect(level).toBe(1);
  });
});
