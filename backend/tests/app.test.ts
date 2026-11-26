import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock('../src/lib/prisma.js', () => ({ prisma: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

const mlUp = () => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));

describe('app', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    db.$queryRaw.mockReset();
  });

  it('GET /api/health is ok when the database and AI service are up', async () => {
    db.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const fetchSpy = mlUp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 'ok', checks: { database: { status: 'ok' }, ml: { status: 'ok' } } });
    expect(res.body.features).toMatchObject({ smtp: expect.any(Boolean), cloudinary: expect.any(Boolean) });
    expect(String(fetchSpy.mock.calls[0][0])).toBe('http://ml.test/health');
  });

  it('GET /api/health is degraded (still 200) when only the AI service is down', async () => {
    db.$queryRaw.mockResolvedValue([]);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 'degraded', checks: { ml: { status: 'down' } } });
  });

  it('GET /api/health returns 503 when the database is down', async () => {
    db.$queryRaw.mockRejectedValue(new Error("Can't reach database server"));
    mlUp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, status: 'down', checks: { database: { status: 'down' } } });
  });

  it('GET /api/health/live never touches the database', async () => {
    const res = await request(app).get('/api/health/live');
    expect(res.status).toBe(200);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('every response carries a request id, and a valid incoming one is kept', async () => {
    const fresh = await request(app).get('/api/health/live');
    expect(fresh.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
    const kept = await request(app).get('/api/health/live').set('X-Request-Id', 'trace-abc-12345');
    expect(kept.headers['x-request-id']).toBe('trace-abc-12345');
    const bad = await request(app).get('/api/health/live').set('X-Request-Id', 'bad id with spaces');
    expect(bad.headers['x-request-id']).not.toBe('bad id with spaces');
  });

  it('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('protected routes need a token', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('rejects malformed OTP requests before touching the DB', async () => {
    const res = await request(app).post('/api/auth/otp/request').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});
