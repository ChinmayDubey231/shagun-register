import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { formatINR } from '@shagun/shared';
import { makeApp } from './helpers.js';

describe('API skeleton', () => {
  const app = makeApp();

  it('reports health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'shagun-register-api' });
  });

  it('returns unknown routes in the shared error shape', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects malformed JSON in the shared error shape', async () => {
    const res = await request(app).post('/auth/google').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_JSON');
  });

  it('can import the shared package', () => {
    expect(formatINR(377500)).toBe('₹3,77,500');
  });

  it('sends CORS headers only to allowed origins', async () => {
    const corsApp = makeApp({ corsOrigins: ['http://localhost:8081'] });
    const ok = await request(corsApp).options('/me').set('Origin', 'http://localhost:8081');
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    const other = await request(corsApp).get('/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
