import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import { getDb } from '@/db/client';
import { getPreferences, setAppLockPreference } from '@/db/ledger';
import i18n from '@/i18n';

/**
 * Away this long and the app asks again on return. Shorter trips (the camera for an
 * invite card, the share sheet, the phone's own PIN screen) don't relock.
 */
const RELOCK_AFTER_MS = 60_000;

interface AppLockState {
  enabled: boolean;
  locked: boolean;
}

export const useAppLock = create<AppLockState>(() => ({ enabled: false, locked: false }));

/** Startup: a phone with the lock on opens locked. */
export function restoreAppLock() {
  const enabled = getPreferences(getDb()).appLock;
  useAppLock.setState({ enabled, locked: enabled });
}

/** True when the phone has a screen lock (PIN, pattern, password or biometrics) to ask for. */
export async function canUseAppLock(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

let authenticating = false;
let leftAt: number | null = null;

export type AuthOutcome = 'ok' | 'cancelled' | 'lockout' | 'failed';

/** Shows the phone's own fingerprint, face or PIN prompt. */
async function authenticate(promptMessage: string): Promise<AuthOutcome> {
  authenticating = true;
  try {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: i18n.t('common.cancel') });
    if (res.success) return 'ok';
    if (res.error === 'user_cancel' || res.error === 'system_cancel' || res.error === 'app_cancel') return 'cancelled';
    return res.error === 'lockout' ? 'lockout' : 'failed';
  } catch {
    return 'failed';
  } finally {
    authenticating = false;
    leftAt = null;
  }
}

export async function unlock(): Promise<AuthOutcome> {
  // With the phone's screen lock removed there is nothing to ask for, and the lock would
  // keep the family out of their own ledger for good.
  const outcome = (await canUseAppLock()) ? await authenticate(i18n.t('lock.prompt')) : 'ok';
  if (outcome === 'ok') useAppLock.setState({ locked: false });
  return outcome;
}

/** Turning the lock on or off asks for the phone's PIN first, so it can't be changed by whoever is holding the phone. */
export async function setAppLockEnabled(on: boolean): Promise<AuthOutcome> {
  const outcome = (await canUseAppLock()) ? await authenticate(i18n.t('lock.confirm')) : on ? 'failed' : 'ok';
  if (outcome !== 'ok') return outcome;
  setAppLockPreference(getDb(), on);
  useAppLock.setState({ enabled: on, locked: false });
  return outcome;
}

/** Relocks after the app has been in the background for a while. Returns the unsubscribe. */
export function watchAppLock(): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    // The phone's own PIN screen sends the app to the background on Android: not a real leave.
    if (authenticating) return;
    if (state === 'background') {
      leftAt ??= Date.now();
    } else if (state === 'active') {
      const away = leftAt === null ? 0 : Date.now() - leftAt;
      leftAt = null;
      if (useAppLock.getState().enabled && away >= RELOCK_AFTER_MS) useAppLock.setState({ locked: true });
    }
  });
  return () => sub.remove();
}
