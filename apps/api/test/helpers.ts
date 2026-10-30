import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import type { AuthResponse } from '@shagun/shared';
import { createApp, type AppOptions } from '../src/app.js';
import type { GoogleVerifier } from '../src/auth/google.js';
import { AppError } from '../src/errors.js';
import { syncIndexes } from '../src/models.js';

export const SECRET = 'test-secret-that-is-at-least-32-characters-long';

/**
 * Fake Google: a token "google:<sub>:<email>:<name>" is "valid". Anything else fails,
 * like a forged or wrong-audience token would.
 */
export const fakeGoogle: GoogleVerifier = async (idToken) => {
  const [prefix, sub, email, name] = idToken.split(':');
  if (prefix !== 'google' || !sub || !email) throw new AppError(401, 'UNAUTHENTICATED', 'Google sign-in failed');
  return { googleId: sub, email, name: name ?? email };
};
export const googleToken = (sub: string, email: string, name: string) =>
  `google:${sub}:${email}:${name}`.padEnd(24, '_');

/** Starts a one-node replica set (transactions need one) and clears it before each test. */
export function useDatabase() {
  let rs: MongoMemoryReplSet;
  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    await mongoose.connect(rs.getUri());
    await syncIndexes();
  }, 120_000);
  beforeEach(async () => {
    const db = mongoose.connection.db!;
    for (const c of await db.collections()) await c.deleteMany({});
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await rs?.stop();
  });
}

export function makeApp(over: Partial<AppOptions> = {}) {
  return createApp({ accessSecret: SECRET, verifyGoogle: fakeGoogle, rateLimits: false, ...over });
}

export async function signIn(app: ReturnType<typeof makeApp>, sub: string, email: string, name: string): Promise<AuthResponse> {
  const res = await request(app).post('/auth/google').send({ idToken: googleToken(sub, email, name) });
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export const bearer = (a: AuthResponse) => ({ Authorization: `Bearer ${a.accessToken}` });
