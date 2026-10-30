import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { ApiUser, AuthResponse } from '@shagun/shared';
import { AppError } from '../errors.js';
import { RefreshToken } from '../models.js';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ISSUER = 'shagun-register';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function signAccessToken(userId: string, secret: string, now = Date.now()) {
  const token = jwt.sign({}, secret, {
    subject: userId,
    issuer: ISSUER,
    algorithm: 'HS256',
    expiresIn: ACCESS_TTL_SECONDS,
  });
  return { token, expiresAt: now + ACCESS_TTL_SECONDS * 1000 };
}

/** Returns the user id, or throws TOKEN_EXPIRED / UNAUTHENTICATED. */
export function verifyAccessToken(token: string, secret: string): string {
  try {
    const payload = jwt.verify(token, secret, { issuer: ISSUER, algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) throw new Error('no subject');
    return payload.sub;
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) throw new AppError(401, 'TOKEN_EXPIRED', 'Session expired');
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in again');
  }
}

async function createRefreshToken(userId: string): Promise<{ id: string; token: string }> {
  const secret = randomBytes(32).toString('base64url');
  const doc = await RefreshToken.create({
    userId,
    secretHash: sha256(secret),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { id: doc._id as string, token: `${doc._id}.${secret}` };
}

export async function issueTokens(user: ApiUser, accessSecret: string): Promise<AuthResponse> {
  const access = signAccessToken(user.id, accessSecret);
  const refresh = await createRefreshToken(user.id);
  return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt, refreshToken: refresh.token, user };
}

function parseRefreshToken(token: string) {
  const dot = token.indexOf('.');
  if (dot < 1) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in again');
  return { id: token.slice(0, dot), secret: token.slice(dot + 1) };
}

function secretMatches(secret: string, hash: string) {
  const a = Buffer.from(sha256(secret), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Exchanges a refresh token for a new pair. The old token stops working.
 * If an already-replaced token is presented, all the user's tokens are revoked.
 */
export async function rotateRefreshToken(token: string): Promise<{ userId: string; refreshToken: string }> {
  const { id, secret } = parseRefreshToken(token);
  const doc = await RefreshToken.findById(id);
  if (!doc || !secretMatches(secret, doc.secretHash) || doc.expiresAt.getTime() < Date.now()) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in again');
  }
  if (doc.revokedAt || doc.replacedBy) {
    await RefreshToken.updateMany({ userId: doc.userId, revokedAt: null }, { revokedAt: new Date() });
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in again');
  }
  const next = await createRefreshToken(doc.userId);
  // Only one concurrent rotation can win; the loser is treated like reuse.
  const claimed = await RefreshToken.updateOne(
    { _id: id, replacedBy: null, revokedAt: null },
    { replacedBy: next.id, revokedAt: new Date() },
  );
  if (claimed.modifiedCount !== 1) {
    await RefreshToken.updateMany({ userId: doc.userId, revokedAt: null }, { revokedAt: new Date() });
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in again');
  }
  return { userId: doc.userId, refreshToken: next.token };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  try {
    const { id, secret } = parseRefreshToken(token);
    const doc = await RefreshToken.findById(id);
    if (doc && secretMatches(secret, doc.secretHash)) {
      await RefreshToken.updateOne({ _id: id }, { revokedAt: new Date() });
    }
  } catch {
    // Signing out with a bad token is not an error worth reporting.
  }
}
