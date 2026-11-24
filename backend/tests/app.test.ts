import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('app', () => {
  it('GET /api/health reports status and features', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.features).toMatchObject({ smtp: expect.any(Boolean), cloudinary: expect.any(Boolean) });
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
