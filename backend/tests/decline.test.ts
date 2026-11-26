import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  gameSession: { findMany: vi.fn() },
  baseline: { findMany: vi.fn() },
  alert: { findFirst: vi.fn() },
}));
vi.mock('../src/lib/prisma.js', () => ({ prisma: db }));
const alerts = vi.hoisted(() => ({ raiseAlert: vi.fn() }));
vi.mock('../src/modules/alerts/service.js', () => alerts);

const { checkDecline } = await import('../src/modules/games/service.js');

const baseline = [
  { metric: 'accuracy', median: 0.85, ewma: 0.84, std: 0.04, sampleSize: 20, computedAt: new Date() },
  { metric: 'responseTimeMs', median: 1500, ewma: 1520, std: 200, sampleSize: 20, computedAt: new Date() },
];
const sessions = (accuracy: number, responseTimeMs = 1500) =>
  Array.from({ length: 5 }, (_, i) => ({ accuracy, responseTimeMs, playedAt: new Date(Date.now() - i * 3_600_000) }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  db.baseline.findMany.mockResolvedValue(baseline);
  db.alert.findFirst.mockResolvedValue(null);
});

describe('checkDecline', () => {
  it('sends the stored personal baseline to the AI service and uses its answer', async () => {
    db.gameSession.findMany.mockResolvedValue(sessions(0.84));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ decline: true, score: 3.1, reason: 'Accuracy dropping' }), { status: 200 }),
    );
    const res = await checkDecline('p1');
    expect(res).toMatchObject({ decline: true, reason: 'Accuracy dropping' });
    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.baseline).toEqual({
      accuracy: { median: 0.85, ewma: 0.84, std: 0.04, count: 20 },
      responseTimeMs: { median: 1500, ewma: 1520, std: 200, count: 20 },
    });
    expect(body.sessions).toHaveLength(5);
    expect(alerts.raiseAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'DECLINE', severity: 'WARN' }));
  });

  it('falls back to local detection and still raises the alert when the AI service is down', async () => {
    db.gameSession.findMany.mockResolvedValue(sessions(0.5));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await checkDecline('p1');
    expect(res.decline).toBe(true);
    expect(res.reason).toMatch(/Accuracy 50% vs usual 85%/);
    expect(alerts.raiseAlert).toHaveBeenCalledTimes(1);
  });

  it('falls back locally when the AI service returns an error status', async () => {
    db.gameSession.findMany.mockResolvedValue(sessions(0.85));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    const res = await checkDecline('p1');
    expect(res).toMatchObject({ decline: false, reason: 'Within usual range' });
    expect(alerts.raiseAlert).not.toHaveBeenCalled();
  });

  it('does not raise a second DECLINE alert within 24 hours', async () => {
    db.gameSession.findMany.mockResolvedValue(sessions(0.5));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    db.alert.findFirst.mockResolvedValue({ id: 'a1', type: 'DECLINE' });
    const res = await checkDecline('p1');
    expect(res.decline).toBe(true);
    expect(alerts.raiseAlert).not.toHaveBeenCalled();
  });

  it('never flags a decline locally before a baseline exists', async () => {
    db.gameSession.findMany.mockResolvedValue(sessions(0.1));
    db.baseline.findMany.mockResolvedValue([]);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    const res = await checkDecline('p1');
    expect(res.decline).toBe(false);
    expect(alerts.raiseAlert).not.toHaveBeenCalled();
  });
});
