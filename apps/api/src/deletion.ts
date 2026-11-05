import mongoose, { type mongo } from 'mongoose';
import type { AccountDeletionPreview, MemberRole } from '@shagun/shared';
import { AppError } from './errors.js';
import { Family, Invite, Membership, RefreshToken, User } from './models.js';
import { eraseFamilyRecords } from './sync.js';

/** How long a deleted ledger stays on the server, in case the owner deleted the wrong one. */
export const LEDGER_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/** A deletedAt this old is past the grace period at once: the next purge erases the ledger. */
const PURGE_NOW = new Date(0);

/** The family row goes last, so a purge cut short is finished by the next run. */
async function purgeFamily(familyId: string) {
  await eraseFamilyRecords(familyId);
  await Invite.deleteMany({ familyId });
  await Membership.deleteMany({ familyId });
  await Family.deleteOne({ _id: familyId });
}

/** Erases every ledger deleted longer ago than the grace period. Returns how many. */
export async function purgeDeletedFamilies(now = Date.now()): Promise<number> {
  const due = await Family.find({ deletedAt: { $ne: null, $lte: new Date(now - LEDGER_GRACE_MS) } }, { _id: 1 }).lean<{ _id: string }[]>();
  for (const family of due) await purgeFamily(family._id);
  return due.length;
}

export async function accountDeletionPreview(userId: string, session: mongo.ClientSession | null = null): Promise<AccountDeletionPreview> {
  const memberships = await Membership.find({ userId }).session(session).lean<{ familyId: string; role: MemberRole }[]>();
  const families = await Family.find({ _id: { $in: memberships.map((m) => m.familyId) }, deletedAt: null }, { name: 1 })
    .session(session)
    .lean<{ _id: string; name: string }[]>();
  const names = new Map(families.map((f) => [f._id, f.name]));
  const preview: AccountDeletionPreview = { deletes: [], blocks: [], leaves: [] };
  for (const m of memberships) {
    const name = names.get(m.familyId);
    if (name === undefined) continue;
    const ledger = { id: m.familyId, name, role: m.role };
    if (m.role !== 'owner') preview.leaves.push(ledger);
    else if (await Membership.exists({ familyId: m.familyId, userId: { $ne: userId } }).session(session)) preview.blocks.push(ledger);
    else preview.deletes.push(ledger);
  }
  return preview;
}

/**
 * Deletes the account and the ledgers only it uses. Gifts it logged in other families' ledgers
 * stay, because they're those families' records; all that's left of the account there is an
 * id that no longer leads to a name or an email.
 */
export async function deleteAccount(userId: string) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { blocks } = await accountDeletionPreview(userId, session);
      if (blocks.length > 0) {
        throw new AppError(409, 'OWNS_SHARED_LEDGER', 'Hand over or delete the ledgers you share with others first');
      }
      await Family.updateMany({ ownerId: userId }, { deletedAt: PURGE_NOW }, { session });
      await Membership.deleteMany({ userId }, { session });
      await Invite.deleteMany({ createdBy: userId }, { session });
      await RefreshToken.deleteMany({ userId }, { session });
      await User.deleteOne({ _id: userId }, { session });
    });
  } finally {
    await session.endSession();
  }
  // The account is gone either way; anything this misses goes on the next scheduled run.
  await purgeDeletedFamilies().catch((e: unknown) => console.error('Purge failed:', e instanceof Error ? e.message : 'unknown'));
}
