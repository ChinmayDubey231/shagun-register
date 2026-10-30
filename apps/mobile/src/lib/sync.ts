import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import type { SyncPullResponse, SyncPushResponse } from '@shagun/shared';
import { getDb } from '@/db/client';
import { listLocalFamilies } from '@/db/ledger';
import { parkFamilyOutbox, syncFamily, type SyncTransport } from '@/sync/engine';
import { useSession } from '@/store/session';
import { syncAccount } from './account';
import { api, API_URL, ApiError } from './api';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncStatus {
  state: SyncState;
  lastSyncAt: number | null;
  lastError: string | null;
}

/** What the sync pill shows. Not persisted: lastPulledSeq lives in SQLite. */
export const useSyncStatus = create<SyncStatus>(() => ({ state: 'idle', lastSyncAt: null, lastError: null }));

const transport: SyncTransport = {
  push: (body) => api<SyncPushResponse>('/sync/push', { method: 'POST', body, timeoutMs: 30_000 }),
  pull: (familyId, since, limit) =>
    api<SyncPullResponse>(`/sync/pull?familyId=${encodeURIComponent(familyId)}&since=${since}&limit=${limit}`, { timeoutMs: 30_000 }),
};

const isOffline = (e: unknown) => e instanceof ApiError && (e.code === 'NETWORK' || e.code === 'NOT_CONFIGURED');

let running: Promise<void> | null = null;
let again = false;

/**
 * Syncs everything this account has on the phone: account first (ledgers joined, left,
 * roles), then each ledger's outbox up and server changes down. One run at a time; a
 * request that arrives mid-run queues exactly one more run, so a gift saved during a sync
 * still goes up straight after.
 */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await runOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function runOnce() {
  const user = useSession.getState().user;
  if (!user) return;
  useSyncStatus.setState({ state: 'syncing' });
  await syncAccount();
  const db = getDb();
  let failure: unknown = null;
  for (const family of listLocalFamilies(db, user.id)) {
    if (!family.registered) continue; // pushed once the server knows the ledger
    try {
      if (family.role === 'viewer') parkFamilyOutbox(db, family.id, 'ROLE_FORBIDDEN: Viewers can’t add entries');
      await syncFamily(db, transport, family.id);
    } catch (e) {
      if (isOffline(e)) {
        failure = e;
        break; // no point trying the other ledgers
      }
      if (e instanceof ApiError && e.code === 'ROLE_FORBIDDEN') {
        // Made a viewer on the server before this phone heard about it: park, then still pull.
        parkFamilyOutbox(db, family.id, `ROLE_FORBIDDEN: ${e.message}`);
        try {
          await syncFamily(db, transport, family.id);
        } catch {
          /* next run */
        }
        continue;
      }
      // Removed from this ledger elsewhere; the next account sync forgets it on this phone.
      if (e instanceof ApiError && e.code === 'NOT_FOUND') continue;
      console.warn('Sync failed for', family.id, e);
      failure = e;
    }
  }
  if (!failure) useSyncStatus.setState({ state: 'idle', lastSyncAt: Date.now(), lastError: null });
  else useSyncStatus.setState({ state: isOffline(failure) ? 'offline' : 'error', lastError: String((failure as Error).message ?? failure) });
}

let debounce: ReturnType<typeof setTimeout> | null = null;

/** After a save: wait a few seconds so a burst of gifts goes up as one batch. */
export function scheduleSync(delayMs = 5_000) {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void syncNow();
  }, delayMs);
}

/** Syncs when the connection comes back. Returns an unsubscribe function. */
export function syncWhenOnline(): () => void {
  // "Online" means our server answers, not that Google does: venue Wi-Fi with a captive
  // portal or a blocked DNS is offline for us. NetInfo's default checks a Google URL.
  if (API_URL) {
    NetInfo.configure({
      reachabilityUrl: `${API_URL}/health`,
      reachabilityTest: async (res) => res.status === 200,
      reachabilityShortTimeout: 5_000,
      reachabilityLongTimeout: 60_000,
      reachabilityRequestTimeout: 10_000,
    });
  }
  let wasOnline: boolean | null = null;
  return NetInfo.addEventListener((s) => {
    const online = s.isConnected !== false && s.isInternetReachable !== false;
    if (online && wasOnline === false) void syncNow();
    if (!online) useSyncStatus.setState({ state: 'offline' });
    wasOnline = online;
  });
}
