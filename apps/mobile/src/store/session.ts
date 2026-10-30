import type { ApiUser } from '@shagun/shared';
import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';
import { getDb } from '@/db/client';
import { listLocalFamilies, loadLocalSetup, type LedgerContext, type LocalFamily } from '@/db/ledger';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionState {
  authStatus: AuthStatus;
  user: ApiUser | null;
  deviceId: string | null;
  /** The ledger on screen. */
  family: LocalFamily | null;
  /** Every ledger on this phone for the signed-in account. */
  families: LocalFamily[];
  /** Last function chosen in Quick Entry, per event, so "Save and next" keeps it. */
  lastSubFunction: Record<string, string | null>;
  setUser: (user: ApiUser | null) => void;
  rememberSubFunction: (eventId: string, value: string | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  authStatus: 'loading',
  user: null,
  deviceId: null,
  family: null,
  families: [],
  lastSubFunction: {},
  setUser: (user) => set({ user, authStatus: user ? 'signedIn' : 'signedOut' }),
  rememberSubFunction: (eventId, value) =>
    set((s) => ({ lastSubFunction: { ...s.lastSubFunction, [eventId]: value } })),
}));

export const newId = () => randomUUID();

/** Re-reads the account's ledgers from the local database into the session. */
export function reloadLedgers() {
  const userId = useSession.getState().user?.id ?? null;
  const setup = loadLocalSetup(getDb(), newId, userId);
  useSession.setState({
    deviceId: setup.deviceId,
    family: setup.family,
    families: userId ? listLocalFamilies(getDb(), userId) : [],
  });
}

/** Everything the write path needs. Only call once a ledger exists (the root layout guarantees that). */
export function useLedgerContext(): LedgerContext {
  const deviceId = useSession((s) => s.deviceId);
  const family = useSession((s) => s.family);
  const userId = useSession((s) => s.user?.id ?? 'local');
  if (!deviceId || !family) throw new Error('useLedgerContext called before setup finished');
  return { db: getDb(), familyId: family.id, deviceId, userId, role: family.role, newId, now: Date.now };
}

export function useFamilyId(): string {
  const family = useSession((s) => s.family);
  if (!family) throw new Error('No family ledger yet');
  return family.id;
}

/** Viewers see everything but can't add or change records. */
export function useCanEdit(): boolean {
  return useSession((s) => s.family?.role !== 'viewer');
}
