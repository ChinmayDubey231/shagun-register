import { z } from 'zod';
import type { MemberRole } from './constants';

/**
 * Request and response shapes shared by the API and the app, so both sides
 * validate the same way. Ledger data (people, events, entries) moves only
 * through /sync in week 4; these cover accounts, families and invites.
 */

/** Invite codes avoid look-alike characters (0/O, 1/I/L) so they can be read out over the phone. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 6;
export const INVITE_TTL_HOURS = 48;

export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(INVITE_CODE_LENGTH, 'Invite codes have 6 characters')
  .refine((c) => [...c].every((ch) => INVITE_ALPHABET.includes(ch)), 'That is not a valid invite code');

/** Normalizes what someone typed ("k7m 2qx", "K7M-2QX") into a code. */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const LANGUAGES = ['en', 'hi'] as const;
export type Language = (typeof LANGUAGES)[number];

export const googleSignInSchema = z.object({ idToken: z.string().min(20).max(4096) });
export const devSignInSchema = z.object({
  email: z.email().max(200),
  name: z.string().trim().min(1).max(80),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(300) });
export const patchMeSchema = z
  .object({ name: z.string().trim().min(1).max(80), language: z.enum(LANGUAGES) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const createFamilySchema = z.object({
  /** The id the phone made when the ledger was created offline. Omit to let the server choose. */
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
});
export const renameFamilySchema = z.object({ name: z.string().trim().min(1).max(80) });
export const createInviteSchema = z.object({ role: z.enum(['editor', 'viewer']) });
export const changeRoleSchema = z.object({ role: z.enum(['editor', 'viewer']) });

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  language: Language;
}

export interface FamilySummary {
  id: string;
  name: string;
  role: MemberRole;
}

export interface AuthResponse {
  accessToken: string;
  /** Epoch ms. */
  accessTokenExpiresAt: number;
  refreshToken: string;
  user: ApiUser;
}

export interface MeResponse {
  user: ApiUser;
  families: FamilySummary[];
}

export interface FamilyMember {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  joinedAt: number;
}

export interface FamilyDetail {
  id: string;
  name: string;
  ownerId: string;
  role: MemberRole;
  members: FamilyMember[];
}

export interface InviteResponse {
  code: string;
  role: 'editor' | 'viewer';
  /** Epoch ms. */
  expiresAt: number;
}

export interface JoinResponse {
  family: FamilySummary;
  alreadyMember: boolean;
}

/** Every API error has this shape; `code` is what the app translates. */
export type ApiErrorCode =
  | 'NOT_FOUND'
  | 'BAD_JSON'
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'ROLE_FORBIDDEN'
  | 'INVITE_INVALID'
  | 'CONFLICT'
  | 'OWNER_CANNOT_LEAVE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}
