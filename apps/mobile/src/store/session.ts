import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';
import { getDb } from '@/db/client';
import type { LedgerContext } from '@/db/ledger';

interface SessionState {
  deviceId: string | null;
  family: { id: string; name: string } | null;
  /** Last function chosen in Quick Entry, per event, so "Save and next" keeps it. */
  lastSubFunction: Record<string, string | null>;
  setSetup: (deviceId: string, family: { id: string; name: string } | null) => void;
  setFamily: (family: { id: string; name: string }) => void;
  rememberSubFunction: (eventId: string, value: string | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  deviceId: null,
  family: null,
  lastSubFunction: {},
  setSetup: (deviceId, family) => set({ deviceId, family }),
  setFamily: (family) => set({ family }),
  rememberSubFunction: (eventId, value) =>
    set((s) => ({ lastSubFunction: { ...s.lastSubFunction, [eventId]: value } })),
}));

export const newId = () => randomUUID();

/** Everything the write path needs. Only call once a family exists (the root layout guarantees that). */
export function useLedgerContext(): LedgerContext {
  const deviceId = useSession((s) => s.deviceId);
  const family = useSession((s) => s.family);
  if (!deviceId || !family) throw new Error('useLedgerContext called before setup finished');
  return { db: getDb(), familyId: family.id, deviceId, userId: 'local', newId, now: Date.now };
}

export function useFamilyId(): string {
  const family = useSession((s) => s.family);
  if (!family) throw new Error('No family ledger yet');
  return family.id;
}
