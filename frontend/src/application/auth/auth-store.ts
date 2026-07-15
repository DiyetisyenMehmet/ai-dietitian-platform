"use client";

import * as React from "react";

import { setAccessTokenProvider } from "@/infrastructure/api/http-client";
import type { AuthSession, AuthTokens, AuthUser } from "@/domain/auth/types";

/**
 * Client-side authentication store. Holds the current session (user + tokens),
 * persists it to localStorage so it survives reloads, and exposes it through
 * `useSyncExternalStore` (matching the pattern used by the other stores in this
 * app). It also registers a bearer-token provider with the HTTP client so
 * authenticated requests attach the access token without importing this store.
 *
 * Security note: for V1 tokens live in localStorage for simplicity. Moving the
 * refresh token to an httpOnly cookie is tracked as a post-launch hardening
 * item; the store API here would not change.
 */

const STORAGE_KEY = "diewish.auth.session";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  tokens: AuthTokens | null;
}

let state: AuthState = { status: "loading", user: null, tokens: null };

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
    if (parsed?.user && parsed?.tokens?.accessToken) return parsed;
    return null;
  } catch {
    return null;
  }
}

// Register the token getter once, at module load, for the HTTP client.
setAccessTokenProvider(() => state.tokens?.accessToken ?? null);

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
      setState({ status: "authenticated", user: session.user, tokens: session.tokens });
    } else {
      setState({ status: "unauthenticated", user: null, tokens: null });
    }
  },

  /** Stores a freshly authenticated session (login / register / refresh). */
  setSession(session: AuthSession): void {
    persist(session);
    setState({ status: "authenticated", user: session.user, tokens: session.tokens });
  },

  /** Patches the cached user (e.g. after completing onboarding). */
  updateUser(patch: Partial<AuthUser>): void {
    if (!state.user || !state.tokens) return;
    const user = { ...state.user, ...patch };
    persist({ user, tokens: state.tokens });
    setState({ ...state, user });
  },

  /** Clears the session (logout). */
  clear(): void {
    persist(null);
    setState({ status: "unauthenticated", user: null, tokens: null });
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
