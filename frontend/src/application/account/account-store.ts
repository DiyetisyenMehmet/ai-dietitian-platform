"use client";

import * as React from "react";

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/domain/account/types";

/**
 * Client-side account store: the user's avatar (as a data URL) and notification
 * preferences. Both are UX-layer settings persisted to localStorage so they
 * survive reloads. Consistent with the other useSyncExternalStore stores; the
 * shape is ready to be backed by a real settings API later.
 */

const STORAGE_KEY = "diewish.account.v1";

interface AccountState {
  /** Data URL of the uploaded avatar, or null to use the initial fallback. */
  avatarDataUrl: string | null;
  notifications: NotificationPreferences;
}

function seed(): AccountState {
  return {
    avatarDataUrl: null,
    notifications: { ...DEFAULT_NOTIFICATION_PREFERENCES },
  };
}

function load(): AccountState {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AccountState>;
      return {
        avatarDataUrl: parsed.avatarDataUrl ?? null,
        notifications: {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...(parsed.notifications ?? {}),
        },
      };
    }
  } catch {
    // Ignore corrupt/unavailable storage.
  }
  return seed();
}

let state: AccountState = seed();
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  state = { ...state };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Degrade gracefully.
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  if (!hydrated) {
    hydrated = true;
    state = load();
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return state;
}

export const accountStore = {
  /** Stores/replaces the avatar (data URL). Pass null to clear. */
  setAvatar(dataUrl: string | null) {
    state.avatarDataUrl = dataUrl;
    emit();
  },
  /** Patches one or more notification preferences. */
  setNotifications(patch: Partial<NotificationPreferences>) {
    state.notifications = { ...state.notifications, ...patch };
    emit();
  },
  /** Clears local account settings (called on logout). */
  reset() {
    state = seed();
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore.
      }
    }
    listeners.forEach((l) => l());
  },
};

/** Subscribe to the account state (avatar + notification preferences). */
export function useAccount(): AccountState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
