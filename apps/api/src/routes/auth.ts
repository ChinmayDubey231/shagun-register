import { Router } from 'express';
import { DEMO_ACCOUNTS, devSignInSchema, googleSignInSchema, patchMeSchema, refreshSchema, type ApiUser, type FamilySummary, type MeResponse } from '@shagun/shared';
import type { GoogleVerifier } from '../auth/google.js';
import { issueTokens, revokeRefreshToken, rotateRefreshToken, signAccessToken } from '../auth/tokens.js';
import { seedDemoLedgers } from '../demo.js';
import { unauthenticated } from '../errors.js';
import { limiter, requireAuth, validateBody } from '../middleware.js';
import { Family, Membership, User, type UserDoc } from '../models.js';

export function toApiUser(u: Pick<UserDoc, '_id' | 'name' | 'email' | 'language'>): ApiUser {
  return { id: u._id, name: u.name, email: u.email, language: (u.language ?? 'en') as ApiUser['language'] };
}

async function upsertUser(googleId: string, email: string, name: string): Promise<ApiUser> {
  const user = await User.findOneAndUpdate(
    { googleId },
    // Keep a name the user has edited; refresh the email from Google.
    { $set: { email }, $setOnInsert: { name, language: 'en' } },
    { upsert: true, returnDocument: 'after', lean: true },
  );
  return toApiUser(user as unknown as UserDoc);
}

export function authRoutes(opts: {
  accessSecret: string;
  verifyGoogle: GoogleVerifier;
  devLogin: boolean;
  rateLimits: boolean;
}) {
  const r = Router();
  const signInLimit = limiter({ windowMs: 15 * 60_000, limit: 30, enabled: opts.rateLimits });

  r.post('/auth/google', signInLimit, validateBody(googleSignInSchema), async (req, res) => {
    const identity = await opts.verifyGoogle(req.body.idToken);
    const user = await upsertUser(identity.googleId, identity.email, identity.name);
    res.json(await issueTokens(user, opts.accessSecret));
  });

  if (opts.devLogin) {
    const devUser = (email: string, name: string) => upsertUser(`dev:${email}`, email, name);
    // Development only (config refuses it in production): sign in with just an email.
    r.post('/auth/dev', signInLimit, validateBody(devSignInSchema), async (req, res) => {
      const email = String(req.body.email).toLowerCase();
      if (DEMO_ACCOUNTS.some((a) => a.email === email)) await seedDemoLedgers(devUser);
      const user = await devUser(email, req.body.name);
      res.json(await issueTokens(user, opts.accessSecret));
    });
  }

  r.post('/auth/refresh', signInLimit, validateBody(refreshSchema), async (req, res) => {
    const { userId, refreshToken } = await rotateRefreshToken(req.body.refreshToken);
    const user = await User.findById(userId).lean<UserDoc>();
    if (!user) throw unauthenticated();
    const access = signAccessToken(userId, opts.accessSecret);
    res.json({ accessToken: access.token, accessTokenExpiresAt: access.expiresAt, refreshToken, user: toApiUser(user) });
  });

  r.post('/auth/logout', validateBody(refreshSchema), async (req, res) => {
    await revokeRefreshToken(req.body.refreshToken);
    res.status(204).end();
  });

  const auth = requireAuth(opts.accessSecret);

  r.get('/me', auth, async (req, res) => {
    const user = await User.findById(req.userId).lean<UserDoc>();
    if (!user) throw unauthenticated();
    const body: MeResponse = { user: toApiUser(user), families: await familiesOf(req.userId!) };
    res.json(body);
  });

  r.patch('/me', auth, validateBody(patchMeSchema), async (req, res) => {
    const user = await User.findByIdAndUpdate(req.userId, { $set: req.body }, { returnDocument: 'after', lean: true });
    if (!user) throw unauthenticated();
    res.json({ user: toApiUser(user as unknown as UserDoc) });
  });

  return r;
}

export async function familiesOf(userId: string): Promise<FamilySummary[]> {
  const memberships = await Membership.find({ userId }).lean<{ familyId: string; role: FamilySummary['role'] }[]>();
  if (memberships.length === 0) return [];
  const families = await Family.find({ _id: { $in: memberships.map((m) => m.familyId) }, deletedAt: null })
    .lean<{ _id: string; name: string }[]>();
  const names = new Map(families.map((f) => [f._id, f.name]));
  return memberships
    .filter((m) => names.has(m.familyId))
    .map((m) => ({ id: m.familyId, name: names.get(m.familyId)!, role: m.role }));
}
