import type { MemberRole } from './constants';

/**
 * Accounts listed on the Developer sign-in card. Signing in as one also sets up the sample
 * ledgers (apps/api/src/demo.ts), so only a server running with DEV_LOGIN ever has them.
 * `role` is the account's role in the main sample ledger; null starts with no ledger at all,
 * for trying setup and invite codes.
 */
export const DEMO_ACCOUNTS = [
  { email: 'asha.demo@example.com', name: 'Asha Sharma', role: 'owner' },
  { email: 'rohan.demo@example.com', name: 'Rohan Sharma', role: 'editor' },
  { email: 'meena.demo@example.com', name: 'Meena Sharma', role: 'viewer' },
  { email: 'kabir.demo@example.com', name: 'Kabir Joshi', role: null },
] as const satisfies readonly { email: string; name: string; role: MemberRole | null }[];
