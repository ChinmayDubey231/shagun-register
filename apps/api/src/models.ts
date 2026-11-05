import { randomUUID } from 'node:crypto';
import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { LANGUAGES, ROLES } from '@shagun/shared';

/**
 * Ids are UUID strings, not ObjectIds: families and ledger records are created on
 * phones (offline) with UUIDs, and users/memberships follow the same convention.
 */
const uuidId = { type: String, default: () => randomUUID() };

const userSchema = new Schema(
  {
    _id: uuidId,
    /** Google's stable account id ("sub"). Dev-login users get "dev:<email>". */
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
    language: { type: String, enum: LANGUAGES, default: 'en' },
  },
  { timestamps: true, versionKey: false },
);

const familySchema = new Schema(
  {
    _id: uuidId,
    name: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    /** Incremented on every synced write in this family (week 4). Orders changes without phone clocks. */
    lastSeq: { type: Number, default: 0 },
    /** Set when the owner deletes the ledger; data is purged after the grace period. */
    deletedAt: { type: Date, default: null },
    /** Which sample ledger this is, on a server running with DEV_LOGIN. It stops the sample being made twice. */
    demoKey: { type: String },
  },
  { timestamps: true, versionKey: false },
);

const membershipSchema = new Schema(
  {
    _id: uuidId,
    familyId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true, versionKey: false },
);
membershipSchema.index({ familyId: 1, userId: 1 }, { unique: true });

const inviteSchema = new Schema(
  {
    _id: uuidId,
    familyId: { type: String, required: true, index: true },
    code: { type: String, required: true, unique: true },
    role: { type: String, enum: ['editor', 'viewer'], required: true },
    createdBy: { type: String, required: true },
    uses: { type: Number, default: 0 },
    /** TTL index: MongoDB deletes the invite once this passes. Accept also checks it, since TTL runs every ~60s. */
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true, versionKey: false },
);

/**
 * Refresh tokens are opaque: `<id>.<secret>`. Only a SHA-256 of the secret is stored.
 * Each use replaces the token; presenting a replaced token again revokes every
 * token the user has (it means the token was copied).
 */
const refreshTokenSchema = new Schema(
  {
    _id: uuidId,
    userId: { type: String, required: true, index: true },
    secretHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    replacedBy: { type: String, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: string };
export type FamilyDoc = InferSchemaType<typeof familySchema> & { _id: string };
export type MembershipDoc = InferSchemaType<typeof membershipSchema> & { _id: string };

export const User = mongoose.model('User', userSchema, 'users');
export const Family = mongoose.model('Family', familySchema, 'families');
export const Membership = mongoose.model('Membership', membershipSchema, 'memberships');
export const Invite = mongoose.model('Invite', inviteSchema, 'invites');
export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema, 'refreshTokens');

export async function syncIndexes() {
  await Promise.all([User, Family, Membership, Invite, RefreshToken].map((m) => m.syncIndexes()));
}
