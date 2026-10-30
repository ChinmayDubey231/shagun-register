import { randomInt } from 'node:crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import {
  changeRoleSchema,
  createFamilySchema,
  createInviteSchema,
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_TTL_HOURS,
  inviteCodeSchema,
  normalizeInviteCode,
  renameFamilySchema,
  type FamilyDetail,
  type FamilySummary,
  type InviteResponse,
  type JoinResponse,
  type MemberRole,
} from '@shagun/shared';
import { AppError, forbidden, notFound } from '../errors.js';
import { limiter, requireAuth, requireRole, validateBody } from '../middleware.js';
import { Family, Invite, Membership, User } from '../models.js';

function randomCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return code;
}

const isDuplicateKey = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000;

export function familyRoutes(opts: { accessSecret: string; rateLimits: boolean }) {
  const r = Router();
  const auth = requireAuth(opts.accessSecret);
  // Guessing codes: 31^6 ≈ 887 million codes, 10 tries per 15 minutes per user.
  const acceptLimit = limiter({ windowMs: 15 * 60_000, limit: 10, enabled: opts.rateLimits });

  /**
   * Create a family ledger; the caller becomes owner. Phones send the id they made
   * offline, and may retry: a repeat by the same owner returns the existing family.
   */
  r.post('/families', auth, validateBody(createFamilySchema), async (req, res) => {
    const { id, name } = req.body as { id?: string; name: string };
    if (id) {
      const existing = await Family.findById(id).lean<{ _id: string; name: string; ownerId: string; deletedAt: Date | null }>();
      if (existing) {
        if (existing.ownerId !== req.userId || existing.deletedAt) {
          throw new AppError(409, 'CONFLICT', 'A ledger with this id already exists');
        }
        const body: FamilySummary = { id: existing._id, name: existing.name, role: 'owner' };
        res.status(200).json(body);
        return;
      }
    }
    const session = await mongoose.startSession();
    let created: FamilySummary;
    try {
      created = await session.withTransaction(async () => {
        const [family] = await Family.create([{ ...(id ? { _id: id } : {}), name, ownerId: req.userId }], { session });
        await Membership.create([{ familyId: family!._id, userId: req.userId, role: 'owner' }], { session });
        return { id: family!._id as string, name, role: 'owner' as const };
      });
    } catch (e) {
      // Two retries racing: the loser sees a duplicate id.
      if (isDuplicateKey(e)) throw new AppError(409, 'CONFLICT', 'A ledger with this id already exists');
      throw e;
    } finally {
      await session.endSession();
    }
    res.status(201).json(created);
  });

  r.get('/families/:id', auth, requireRole('viewer'), async (req, res) => {
    const family = await Family.findById(req.params.id).lean<{ _id: string; name: string; ownerId: string }>();
    const memberships = await Membership.find({ familyId: req.params.id })
      .sort({ createdAt: 1 })
      .lean<{ userId: string; role: MemberRole; createdAt: Date }[]>();
    const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } })
      .lean<{ _id: string; name: string; email: string }[]>();
    const byId = new Map(users.map((u) => [u._id, u]));
    const order: Record<MemberRole, number> = { owner: 0, editor: 1, viewer: 2 };
    const body: FamilyDetail = {
      id: family!._id,
      name: family!.name,
      ownerId: family!.ownerId,
      role: req.membership!.role,
      members: memberships
        .filter((m) => byId.has(m.userId))
        .map((m) => ({
          userId: m.userId,
          name: byId.get(m.userId)!.name,
          email: byId.get(m.userId)!.email,
          role: m.role,
          joinedAt: m.createdAt.getTime(),
        }))
        .sort((a, b) => order[a.role] - order[b.role] || a.joinedAt - b.joinedAt),
    };
    res.json(body);
  });

  r.patch('/families/:id', auth, requireRole('owner'), validateBody(renameFamilySchema), async (req, res) => {
    await Family.updateOne({ _id: req.params.id }, { name: req.body.name });
    const body: FamilySummary = { id: req.params.id as string, name: req.body.name, role: 'owner' };
    res.json(body);
  });

  /** Soft delete. Members lose access at once; the data is purged after 30 days (purge job: week 6). */
  r.delete('/families/:id', auth, requireRole('owner'), async (req, res) => {
    await Family.updateOne({ _id: req.params.id }, { deletedAt: new Date() });
    await Invite.deleteMany({ familyId: req.params.id });
    res.status(204).end();
  });

  r.post('/families/:id/invites', auth, requireRole('owner', 'Only the owner can invite people'), validateBody(createInviteSchema), async (req, res) => {
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const invite = await Invite.create({
          familyId: String(req.params.id),
          code: randomCode(),
          role: req.body.role,
          createdBy: req.userId,
          expiresAt,
        });
        const body: InviteResponse = { code: invite.code, role: invite.role as InviteResponse['role'], expiresAt: expiresAt.getTime() };
        res.status(201).json(body);
        return;
      } catch (e) {
        if (!isDuplicateKey(e)) throw e;
      }
    }
    throw new AppError(500, 'INTERNAL', 'Could not make a unique code. Try again.');
  });

  r.get('/families/:id/invites', auth, requireRole('owner', 'Only the owner can see invites'), async (req, res) => {
    const invites = await Invite.find({ familyId: req.params.id, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .lean<{ code: string; role: InviteResponse['role']; expiresAt: Date }[]>();
    const body: InviteResponse[] = invites.map((i) => ({ code: i.code, role: i.role, expiresAt: i.expiresAt.getTime() }));
    res.json(body);
  });

  r.delete('/families/:id/invites/:code', auth, requireRole('owner', 'Only the owner can cancel invites'), async (req, res) => {
    await Invite.deleteOne({ familyId: req.params.id, code: normalizeInviteCode(String(req.params.code)) });
    res.status(204).end();
  });

  r.patch(
    '/families/:id/members/:userId',
    auth,
    requireRole('owner', 'Only the owner can change roles'),
    validateBody(changeRoleSchema),
    async (req, res) => {
      const target = await Membership.findOne({ familyId: req.params.id, userId: req.params.userId });
      if (!target) throw notFound('Member not found');
      if (target.role === 'owner') throw forbidden("The owner's role can't be changed");
      target.role = req.body.role;
      await target.save();
      res.json({ userId: req.params.userId, role: target.role });
    },
  );

  /** The owner removes someone, or any member leaves. The owner can't leave their own ledger. */
  r.delete('/families/:id/members/:userId', auth, requireRole('viewer'), async (req, res) => {
    const self = req.params.userId === req.userId;
    if (!self && req.membership!.role !== 'owner') throw forbidden('Only the owner can remove people');
    const target = await Membership.findOne({ familyId: req.params.id, userId: req.params.userId });
    if (!target) throw notFound('Member not found');
    if (target.role === 'owner') {
      throw new AppError(409, 'OWNER_CANNOT_LEAVE', 'The owner can’t leave. Delete the ledger instead.');
    }
    await target.deleteOne();
    res.status(204).end();
  });

  /** Join a family with a code. Joining again is harmless and never changes an existing role. */
  r.post('/invites/:code/accept', auth, acceptLimit, async (req, res) => {
    const parsed = inviteCodeSchema.safeParse(normalizeInviteCode(String(req.params.code)));
    if (!parsed.success) throw new AppError(404, 'INVITE_INVALID', 'That code is wrong or has expired');
    const invite = await Invite.findOne({ code: parsed.data, expiresAt: { $gt: new Date() } }).lean<{
      _id: string;
      familyId: string;
      role: 'editor' | 'viewer';
    }>();
    const family = invite
      ? await Family.findOne({ _id: invite.familyId, deletedAt: null }).lean<{ _id: string; name: string }>()
      : null;
    if (!invite || !family) throw new AppError(404, 'INVITE_INVALID', 'That code is wrong or has expired');

    const existing = await Membership.findOne({ familyId: family._id, userId: req.userId }).lean<{ role: MemberRole }>();
    if (existing) {
      const body: JoinResponse = { family: { id: family._id, name: family.name, role: existing.role }, alreadyMember: true };
      res.json(body);
      return;
    }
    try {
      await Membership.create({ familyId: family._id, userId: req.userId, role: invite.role });
    } catch (e) {
      if (!isDuplicateKey(e)) throw e; // a double tap: the first request already joined
    }
    await Invite.updateOne({ _id: invite._id }, { $inc: { uses: 1 } });
    const body: JoinResponse = { family: { id: family._id, name: family.name, role: invite.role }, alreadyMember: false };
    res.json(body);
  });

  return r;
}
