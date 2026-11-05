import { normalizeInviteCode, type AuthResponse, type FamilySummary, type JoinResponse, type MeResponse } from '@shagun/shared';
import { getDb } from '@/db/client';
import {
  addJoinedFamily,
  applyServerFamilies,
  createLocalFamily,
  forgetAccount,
  markFamilyRegistered,
  setCurrentFamily,
  unregisteredFamilies,
} from '@/db/ledger';
import { newId, reloadLedgers, useSession } from '@/store/session';
import { api, ApiError, clearAuth, restoreAuth, saveAuth, setSignedOutHandler } from './api';
import { restoreAppLock } from './appLock';
import { getGoogleIdToken, googleRevokeAccess, googleSignOut } from './googleSignIn';
import { reconcileLanguage, restoreLanguage } from './language';

/** Startup: restore the saved session (works offline), then refresh from the server in the background. */
export async function startSession() {
  // Before the session is set, so the first screen draws in the right language, locked if asked.
  await restoreLanguage();
  restoreAppLock();
  setSignedOutHandler(() => {
    useSession.getState().setUser(null);
    reloadLedgers();
  });
  const user = await restoreAuth();
  useSession.getState().setUser(user);
  reloadLedgers();
  // The root layout starts the first sync once the session is set (see lib/sync.ts).
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
      await reconcileLanguage(me.user.language);
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

/** Waits out a sync already running, whose answer may predate a change just made on the server. */
async function syncAccountAfterChange() {
  await syncing;
  await syncAccount();
}

/** Owner only. Needs a connection. */
export async function renameLedger(familyId: string, name: string) {
  await api(`/families/${familyId}`, { method: 'PATCH', body: { name } });
  await syncAccountAfterChange();
}

/** Owner only. Needs a connection. The caller stays on as an editor. */
export async function handOverLedger(familyId: string, userId: string) {
  await api(`/families/${familyId}/owner`, { method: 'POST', body: { userId } });
  await syncAccountAfterChange();
}

/** Owner only. Needs a connection. The account sync then removes the ledger and its records from this phone. */
export async function deleteLedger(familyId: string) {
  await api(`/families/${familyId}`, { method: 'DELETE' });
  await syncAccountAfterChange();
}

/** Needs a connection. Nothing on the phone changes unless the server has deleted the account. */
export async function deleteAccount() {
  const user = useSession.getState().user;
  await api('/me', { method: 'DELETE' });
  if (user) forgetAccount(getDb(), user.id);
  await googleRevokeAccess();
  await signOut();
}
