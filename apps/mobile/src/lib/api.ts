import type { ApiErrorCode, ApiUser, AuthResponse } from '@shagun/shared';
import { deleteSecure, getSecure, setSecure } from './secureStorage';

/**
 * API base URL, baked in at build time from EXPO_PUBLIC_API_URL.
 * Android emulator → http://10.0.2.2:4000, phone on Wi-Fi → http://<your PC's LAN IP>:4000,
 * release builds → the Render URL.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export type ClientErrorCode = ApiErrorCode | 'NETWORK' | 'NOT_CONFIGURED';

export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const KEY = 'shagun.auth.v1';

interface StoredAuth {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  user: ApiUser;
}

let auth: StoredAuth | null = null;
let refreshing: Promise<StoredAuth> | null = null;
let onSignedOut: (() => void) | null = null;

/** Called when the server says the session is over (refresh token revoked or expired). */
export function setSignedOutHandler(handler: () => void) {
  onSignedOut = handler;
}

/** Loads saved tokens at startup. Works offline: being signed in doesn't need the network. */
export async function restoreAuth(): Promise<ApiUser | null> {
  try {
    const raw = await getSecure(KEY);
    auth = raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    auth = null;
  }
  return auth?.user ?? null;
}

export async function saveAuth(res: AuthResponse): Promise<ApiUser> {
  auth = { ...res };
  await setSecure(KEY, JSON.stringify(auth));
  return res.user;
}

export async function clearAuth(): Promise<void> {
  const token = auth?.refreshToken;
  auth = null;
  await deleteSecure(KEY);
  if (token) {
    // Best effort: tell the server to revoke it. Signing out works offline too.
    void request('/auth/logout', { method: 'POST', body: { refreshToken: token }, authed: false }).catch(() => undefined);
  }
}

export const currentUser = () => auth?.user ?? null;

async function refresh(): Promise<StoredAuth> {
  if (!auth) throw new ApiError('UNAUTHENTICATED', 'Sign in again', 401);
  refreshing ??= (async () => {
    try {
      const res = await request<AuthResponse>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: auth!.refreshToken },
        authed: false,
      });
      await saveAuth(res);
      return auth!;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        auth = null;
        await deleteSecure(KEY);
        onSignedOut?.();
      }
      throw e;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  authed?: boolean;
  timeoutMs?: number;
}

async function request<T>(path: string, opts: RequestOptions, token?: string): Promise<T> {
  if (!API_URL) throw new ApiError('NOT_CONFIGURED', 'EXPO_PUBLIC_API_URL is not set');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: opts.method ?? 'GET',
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('NETWORK', 'No connection to the server');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as { error?: { code: ApiErrorCode; message: string } } | null;
  if (!res.ok) {
    throw new ApiError(json?.error?.code ?? 'INTERNAL', json?.error?.message ?? `HTTP ${res.status}`, res.status);
  }
  return json as T;
}

/**
 * Calls the API. Authenticated calls refresh the access token when it is about to
 * expire, and retry once if the server says it already has.
 */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (opts.authed === false) return request<T>(path, opts);
  if (!auth) throw new ApiError('UNAUTHENTICATED', 'Sign in again', 401);
  if (auth.accessTokenExpiresAt - Date.now() < 30_000) await refresh();
  try {
    return await request<T>(path, opts, auth!.accessToken);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'TOKEN_EXPIRED') {
      const fresh = await refresh();
      return request<T>(path, opts, fresh.accessToken);
    }
    throw e;
  }
}
