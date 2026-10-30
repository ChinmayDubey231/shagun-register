import { Router } from 'express';
import { syncPullQuerySchema, syncPushSchema } from '@shagun/shared';
import { AppError } from '../errors.js';
import { requireAuth, requireRole, validateBody } from '../middleware.js';
import { applyPush, readEntryHistory, readPull } from '../sync.js';

export function syncRoutes(opts: { accessSecret: string }) {
  const r = Router();
  const auth = requireAuth(opts.accessSecret);

  r.post(
    '/sync/push',
    auth,
    validateBody(syncPushSchema),
    requireRole('editor', 'Viewers can’t add entries', (req) => req.body?.familyId),
    async (req, res) => {
      res.json(await applyPush(req.body.familyId, req.userId!, req.body.changes));
    },
  );

  r.get(
    '/sync/pull',
    auth,
    (req, _res, next) => {
      const parsed = syncPullQuerySchema.safeParse(req.query);
      if (!parsed.success) return next(new AppError(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid query'));
      res_locals(req).pull = parsed.data;
      next();
    },
    requireRole('viewer', undefined, (req) => res_locals(req).pull?.familyId),
    async (req, res) => {
      const { familyId, since, limit } = res_locals(req).pull!;
      res.json(await readPull(familyId, since, limit));
    },
  );

  r.get('/families/:id/entries/:entryId/history', auth, requireRole('viewer'), async (req, res) => {
    res.json(await readEntryHistory(String(req.params.id), String(req.params.entryId)));
  });

  return r;
}

type PullQuery = { familyId: string; since: number; limit: number };
const locals = new WeakMap<object, { pull?: PullQuery }>();
function res_locals(req: object) {
  let v = locals.get(req);
  if (!v) locals.set(req, (v = {}));
  return v;
}
