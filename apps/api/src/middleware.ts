import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { MemberRole } from '@shagun/shared';
import type { ZodType } from 'zod';
import { verifyAccessToken } from './auth/tokens.js';
import { AppError, errorBody, forbidden, notFound, unauthenticated } from './errors.js';
import { Family, Membership } from './models.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
    membership?: { familyId: string; role: MemberRole };
  }
}

/** Requires `Authorization: Bearer <access token>`; sets req.userId. */
export function requireAuth(accessSecret: string): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer (.+)$/.exec(header);
    if (!match) return next(unauthenticated());
    req.userId = verifyAccessToken(match[1]!, accessSecret);
    next();
  };
}

const RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, owner: 2 };

/**
 * Loads the caller's membership in the family named by `req.params.id` and rejects
 * the request if their role is below `min`. Non-members get 404, not 403, so family
 * ids can't be probed.
 */
export function requireRole(min: MemberRole, message?: string): RequestHandler {
  return async (req, _res, next) => {
    const familyId = req.params.id;
    if (typeof familyId !== 'string') return next(notFound('Family not found'));
    const [membership, family] = await Promise.all([
      Membership.findOne({ familyId, userId: req.userId }).lean<{ role: MemberRole }>(),
      Family.findOne({ _id: familyId, deletedAt: null }, { _id: 1 }).lean(),
    ]);
    if (!membership || !family) return next(notFound('Family not found'));
    if (RANK[membership.role] < RANK[min]) {
      return next(forbidden(message ?? `Only ${min === 'owner' ? 'the owner' : 'owners and editors'} can do this`));
    }
    req.membership = { familyId, role: membership.role };
    next();
  };
}

/** Parses req.body with a zod schema; the parsed value replaces req.body. */
export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.length ? `${issue.path.join('.')}: ` : '';
      return next(new AppError(400, 'VALIDATION', path + (issue?.message ?? 'Invalid request')));
    }
    req.body = parsed.data;
    next();
  };
}

/** Rate limit keyed by user when signed in, else by IP. */
export function limiter(opts: { windowMs: number; limit: number; enabled: boolean }): RequestHandler {
  if (!opts.enabled) return (_req, _res, next) => next();
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Signed-in calls are limited per account; others per IP (IPv6 grouped by /56 so one network can't rotate addresses).
    keyGenerator: (req) => (req.userId ? `user:${req.userId}` : ipKeyGenerator(req.ip ?? '0.0.0.0')),
    handler: (_req, res) => {
      res.status(429).json(errorBody('RATE_LIMITED', 'Too many attempts. Wait a few minutes and try again.'));
    },
  });
}

/** CORS for the Expo web preview only. Native apps send no Origin and are unaffected. */
export function cors(origins: string[]): RequestHandler {
  const allowed = new Set(origins);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}
