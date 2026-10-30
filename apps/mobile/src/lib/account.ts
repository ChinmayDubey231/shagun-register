import { normalizeInviteCode, type AuthResponse, type FamilySummary, type JoinResponse, type MeResponse } from '@shagun/shared';
import { getDb } from '@/db/client';
import {
  addJoinedFamily,
  applyServerFamilies,
  createLocalFamily,
  markFamilyRegistered,
  setCurrentFamily,
  unregisteredFamilies,
} from '@/db/ledger';
import { newId, reloadLedgers, useSession } from '@/store/session';
import { api, ApiError, clearAuth, restoreAuth, saveAuth, setSignedOutHandler } from './api';
import { getGoogleIdToken, googleSignOut } from './googleSignIn';

/** Startup: restore the saved session (works offline), then refresh from the server in the background. */
export async function startSession() {
  setSignedOutHandler(() => {
    useSession.getState().setUser(null);
    reloadLedgers();
  });
  const user = await restoreAuth();
  useSession.getState().setUser(user);
  reloadLedgers();
  if (user) void syncAccount();
}

async function finishSignIn(res: AuthResponse) {
  const user = await saveAuth(res);
  useSession.getState().setUser(user);
  reloadLedgers();
  await syncAccount();
}

/** Returns false if the user closed Google's account picker. */
export async function signInWithGoogle(): Promise<boolean> {
  const idToken = await getGoogleIdToken();
  if (!idToken) return false;
  await finishSignIn(await api<AuthResponse>('/auth/google', { method: 'POST', body: { idToken }, authed: false }));
  return true;
}

export async function signInDev(email: string, name: string) {
  await finishSignIn(await api<AuthResponse>('/auth/dev', { method: 'POST', body: { email, name }, authed: false }));
}

/**
 * Signs out on this phone. Ledgers stay on the phone, scoped to this account, and
 * come back when the same account signs in again.
 */
export async function signOut() {
  await clearAuth();
  await googleSignOut();
  useSession.setState({ user: null, authStatus: 'signedOut', family: null, families: [] });
}

let syncing: Promise<void> | null = null;

/**
 * Brings the phone in line with the server: ledgers joined or left elsewhere, new names
 * and roles, then registers ledgers made offline. Quietly does nothing without a connection.
 */
export function syncAccount(): Promise<void> {
  syncing ??= (async () => {
    const user = useSession.getState().user;
    if (!user) return;
    try {
      const me = await api<MeResponse>('/me');
      useSession.getState().setUser(me.user);
      applyServerFamilies(getDb(), me.user.id, me.families, Date.now());
      await registerPendingFamilies(me.user.id);
    } catch (e) {
      if (!(e instanceof ApiError) || (e.code !== 'NETWORK' && e.code !== 'NOT_CONFIGURED')) console.warn('Account sync failed:', e);
    } finally {
      reloadLedgers();
      syncing = null;
    }
  })();
  return syncing;
}

async function registerPendingFamilies(userId: string) {
  for (const family of unregisteredFamilies(getDb(), userId)) {
    if (family.role !== 'owner') continue;
    try {
      await api<FamilySummary>('/families', { method: 'POST', body: { id: family.id, name: family.name } });
      markFamilyRegistered(getDb(), family.id, Date.now());
    } catch (e) {
      // CONFLICT would mean the id is taken by someone else: leave it local and keep going.
      if (e instanceof ApiError && e.code === 'NETWORK') return;
    }
  }
}

/** Creates a ledger on this phone at once; it is registered with the server when online. */
export function createLedger(name: string) {
  const user = useSession.getState().user;
  createLocalFamily(getDb(), name, newId, user?.id ?? null);
  reloadLedgers();
  void syncAccount();
}

/** Joins with an invite code. Needs a connection. */
export async function joinLedger(code: string): Promise<JoinResponse> {
  const user = useSession.getState().user;
  if (!user) throw new ApiError('UNAUTHENTICATED', 'Sign in again', 401);
  const res = await api<JoinResponse>(`/invites/${encodeURIComponent(normalizeInviteCode(code))}/accept`, { method: 'POST' });
  addJoinedFamily(getDb(), res.family, user.id, Date.now());
  reloadLedgers();
  return res;
}

export function switchLedger(familyId: string) {
  setCurrentFamily(getDb(), familyId);
  reloadLedgers();
}
