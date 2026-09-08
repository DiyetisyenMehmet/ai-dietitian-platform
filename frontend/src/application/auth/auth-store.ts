"use client";

import * as React from "react";

import {
  setAccessTokenProvider,
  setUnauthorizedHandler,
} from "@/infrastructure/api/http-client";
import { authClient } from "@/infrastructure/auth/auth-client";
import type { AuthSession, AuthTokens, AuthUser } from "@/domain/auth/types";

const LEGACY_STORAGE_KEY = "diewish.auth.session";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  tokens: AuthTokens | null;
}

let state: AuthState = { status: "loading", user: null, tokens: null };
let sessionVersion = 0;
let hydrationPromise: Promise<void> | null = null;
let refreshPromise: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: AuthState): void {
  state = next;
  emit();
}

function removeLegacyPersistedSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

function cancelNativeNutritionReminders(): void {
  if (typeof window === "undefined") return;
  try {
    const bridge = (window as typeof window & { DiewishReminders?: { cancelAll(): void } })
      .DiewishReminders;
    if (bridge) bridge.cancelAll();
  } catch {
    // Logout must never be blocked by an optional native capability.
  }
}

function applySession(session: AuthSession): void {
  sessionVersion += 1;
  setState({ status: "authenticated", user: session.user, tokens: session.tokens });
}

function clearSession(): void {
  sessionVersion += 1;
  cancelNativeNutritionReminders();
  removeLegacyPersistedSession();
  setState({ status: "unauthenticated", user: null, tokens: null });
}

/**
 * Rotates the HttpOnly refresh cookie at most once for concurrent 401 responses.
 * Only the in-memory access token is returned to the transport layer.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  if (state.status !== "authenticated") return null;

  const versionAtStart = sessionVersion;
  refreshPromise = (async () => {
    try {
      const session = await authClient.refresh();
      if (sessionVersion !== versionAtStart || state.status !== "authenticated") {
        return null;
      }
      applySession(session);
      return session.tokens.accessToken;
    } catch {
      if (sessionVersion === versionAtStart && state.status === "authenticated") {
        clearSession();
      }
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

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

  getServerSnapshot(): AuthState {
    return { status: "loading", user: null, tokens: null };
  },

  /** Resolves the browser session from the HttpOnly cookie; no token storage is read. */
  hydrate(): Promise<void> {
    removeLegacyPersistedSession();
    if (state.status !== "loading") return Promise.resolve();
    if (hydrationPromise) return hydrationPromise;

    const versionAtStart = sessionVersion;
    hydrationPromise = (async () => {
      try {
        const session = await authClient.refresh();
        if (sessionVersion === versionAtStart && state.status === "loading") {
          applySession(session);
        }
      } catch {
        if (sessionVersion === versionAtStart && state.status === "loading") {
          sessionVersion += 1;
          setState({ status: "unauthenticated", user: null, tokens: null });
        }
      } finally {
        hydrationPromise = null;
      }
    })();
    return hydrationPromise;
  },

  /** Stores login/register/refresh results in memory only. */
  setSession(session: AuthSession): void {
    removeLegacyPersistedSession();
    applySession(session);
  },

  updateUser(patch: Partial<AuthUser>): void {
    if (!state.user || !state.tokens) return;
    sessionVersion += 1;
    setState({ ...state, user: { ...state.user, ...patch } });
  },

  clear(): void {
    clearSession();
  },

  /** Compatibility shim: refresh tokens are deliberately no longer JS-readable. */
  getRefreshToken(): null {
    return null;
  },
} as const;

export function useAuth(): AuthState {
  return React.useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
}
