"use client";

import * as React from "react";

import {
  apiRequest,
  setAccessTokenProvider,
  setUnauthorizedHandler,
} from "@/infrastructure/api/http-client";
import { AUTH_ENDPOINTS } from "@/infrastructure/auth/endpoints";
import type { AuthSession, AuthTokens, AuthUser } from "@/domain/auth/types";

/**
 * Client-side authentication store. Holds the current session (user + tokens),
 * persists it to localStorage so it survives reloads, and exposes it through
 * `useSyncExternalStore` (matching the pattern used by the other stores in this
 * app). It also registers bearer-token + refresh callbacks with the HTTP client
 * so authenticated requests can transparently survive normal access-token
 * expiry without importing this store into the transport layer.
 *
 * Security note: for V1 tokens live in localStorage for simplicity. Moving the
 * refresh token to an httpOnly cookie remains a post-launch hardening item; the
 * store API here would not change.
 */

const STORAGE_KEY = "diewish.auth.session";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  tokens: AuthTokens | null;
}

let state: AuthState = { status: "loading", user: null, tokens: null };
let sessionVersion = 0;
let refreshPromise: Promise<string | null> | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: AuthState): void {
  state = next;
  emit();
}

function persist(session: AuthSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage may be unavailable (private mode / quota) — degrade gracefully.
  }
}

function readPersisted(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (parsed?.user && parsed?.tokens?.accessToken && parsed?.tokens?.refreshToken) return parsed;
    return null;
  } catch {
    return null;
  }
}

function applySession(session: AuthSession): void {
  sessionVersion += 1;
  persist(session);
  setState({ status: "authenticated", user: session.user, tokens: session.tokens });
}

function clearSession(): void {
  sessionVersion += 1;
  persist(null);
  setState({ status: "unauthenticated", user: null, tokens: null });
}

/**
 * Rotates the refresh token at most once for concurrent 401 responses. This is
 * critical because backend refresh tokens are single-use: without a shared
 * promise, several simultaneous API calls could race and invalidate each other.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const refreshToken = state.tokens?.refreshToken;
  if (!refreshToken) return null;

  const versionAtStart = sessionVersion;

  refreshPromise = (async () => {
    try {
      const session = await apiRequest<AuthSession>({
        path: AUTH_ENDPOINTS.refresh,
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });

      // The user may have logged out or signed in as another account while the
      // refresh request was in flight. Never resurrect or overwrite that state.
      if (
        sessionVersion !== versionAtStart ||
        state.tokens?.refreshToken !== refreshToken ||
        state.status !== "authenticated"
      ) {
        return null;
      }

      applySession(session);
      return session.tokens.accessToken;
    } catch {
      // Only invalidate the session that actually initiated this failed refresh.
      if (
        sessionVersion === versionAtStart &&
        state.tokens?.refreshToken === refreshToken &&
        state.status === "authenticated"
      ) {
        clearSession();
      }
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Register transport hooks once, at module load. The HTTP client stays generic
// and knows nothing about how Diewish stores or rotates authentication state.
setAccessTokenProvider(() => state.tokens?.accessToken ?? null);
setUnauthorizedHandler(refreshAccessToken);

export const authStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): AuthState {
    return state;
  },

  /** Server snapshot — always "loading" so markup matches the first client paint. */
  getServerSnapshot(): AuthState {
    return { status: "loading", user: null, tokens: null };
  },

  /** Rehydrates session from storage. Call once on app mount. */
  hydrate(): void {
    const session = readPersisted();
    if (session) {
      applySession(session);
    } else {
      sessionVersion += 1;
      setState({ status: "unauthenticated", user: null, tokens: null });
    }
  },

  /** Stores a freshly authenticated session (login / register / refresh). */
  setSession(session: AuthSession): void {
    applySession(session);
  },

  /** Patches the cached user (e.g. after completing onboarding). */
  updateUser(patch: Partial<AuthUser>): void {
    if (!state.user || !state.tokens) return;
    const user = { ...state.user, ...patch };
    const session = { user, tokens: state.tokens };
    sessionVersion += 1;
    persist(session);
    setState({ ...state, user });
  },

  /** Clears the session (logout or unrecoverable refresh failure). */
  clear(): void {
    clearSession();
  },

  /** Returns the current refresh token, if any (for logout/refresh calls). */
  getRefreshToken(): string | null {
    return state.tokens?.refreshToken ?? null;
  },
} as const;

/** React hook exposing the reactive auth state. */
export function useAuth(): AuthState {
  return React.useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
}
