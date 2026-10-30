import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { getDb } from '@/db/client';
import { countPendingChanges } from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { scheduleSync, syncNow, syncWhenOnline, useSyncStatus } from '@/lib/sync';
import { useSession } from '@/store/session';

/**
 * When the app syncs (build guide, Week 4): at startup and sign-in, when it comes back to
 * the foreground, when the connection returns, a few seconds after a save, and on
 * pull-to-refresh (lists call syncNow themselves). Renders nothing.
 */
export function SyncDriver() {
  const signedIn = useSession((s) => s.authStatus === 'signedIn');
  // Joining, creating or registering a ledger changes this key and starts a sync.
  const familiesKey = useSession((s) => s.families.map((f) => `${f.id}:${f.role}:${f.registered}`).join('|'));
  const pending = useDbQuery(() => countPendingChanges(getDb()), ['outbox'], []);
  const lastPending = useRef(pending);

  useEffect(() => {
    if (signedIn) void syncNow();
  }, [signedIn, familiesKey]);

  useEffect(() => {
    if (!signedIn) return;
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void syncNow();
    });
    const unsubscribeNet = syncWhenOnline();
    // Backstop for networks that come back without telling anyone: retry every 30 s while
    // the last attempt failed.
    const retry = setInterval(() => {
      const { state } = useSyncStatus.getState();
      if (state === 'offline' || state === 'error') void syncNow();
    }, 30_000);
    return () => {
      app.remove();
      unsubscribeNet();
      clearInterval(retry);
    };
  }, [signedIn]);

  useEffect(() => {
    if (signedIn && pending > lastPending.current) scheduleSync();
    lastPending.current = pending;
  }, [pending, signedIn]);

  return null;
}
