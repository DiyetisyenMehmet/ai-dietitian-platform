"use client";

import * as React from "react";

import {
  setAccessTokenProvider,
  setAuthFailureHandler,
  setAuthRefreshHandler,
} from "@/infrastructure/api/http-client";
import { authClient } from "@/infrastructure/auth/auth-client";
import type { AuthSession, AuthTokens, AuthUser } from "@/domain/auth/types";

/**
 * Client-side auth state. Access tokens live only in memory. Refresh tokens are
 * never readable by browser JavaScript; they are managed exclusively through
 * the backend's HttpOnly cookie.
 */
type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  tokens: AuthTokens | null;
}

let state: AuthState = { status: "loading", user: null, tokens: null };
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: AuthState): void {
  state = next;
  emit();
}

function applySession(session: AuthSession): void {
  setState({ status: "authenticated", user: session.user, tokens: session.tokens });
}

async function hydrateFromRefreshCookie(): Promise<void> {
  try {
    const session = await authClient.refresh();
    applySession(session);
  } catch {
    setState({ status: "unauthenticated", user: null, tokens: null });
  }
}

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

  /** Resolves an existing browser session using the HttpOnly refresh cookie. */
  hydrate(): Promise<void> {
    if (state.status !== "loading") return Promise.resolve();
    if (!hydrationPromise) {
      hydrationPromise = hydrateFromRefreshCookie().finally(() => {
        hydrationPromise = null;
      });
    }
    return hydrationPromise;
  },

  /** Stores login/register/refresh results in memory only. */
  setSession(session: AuthSession): void {
    applySession(session);
  },

  updateUser(patch: Partial<AuthUser>): void {
    if (!state.user || !state.tokens) return;
    setState({ ...state, user: { ...state.user, ...patch } });
  },

  clear(): void {
    setState({ status: "unauthenticated", user: null, tokens: null });
  },

  /** Compatibility shim: refresh tokens are deliberately no longer JS-readable. */
  getRefreshToken(): null {
    return null;
  },
} as const;

setAccessTokenProvider(() => state.tokens?.accessToken ?? null);
setAuthRefreshHandler(async () => {
  const session = await authClient.refresh();
  applySession(session);
});
setAuthFailureHandler(() => authStore.clear());

export function useAuth(): AuthState {
  return React.useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
}
