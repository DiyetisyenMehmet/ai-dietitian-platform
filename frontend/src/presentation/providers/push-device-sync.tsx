"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/application/auth/auth-store";
import { notificationClient } from "@/infrastructure/notifications/notification-client";

interface NativePushBridge {
  isAvailable(): boolean;
  pushToken(): string;
  ensurePushToken(): void;
  appVersion(): string;
  pendingNotificationPath?(): string;
  clearPendingNotificationPath?(): void;
}

const SAFE_NOTIFICATION_TARGETS = new Set([
  "/dashboard",
  "/ai",
  "/insights",
  "/goals",
  "/meals",
  "/activity",
  "/sleep",
  "/progress",
  "/profile/blood-tests",
  "/profile/notifications",
]);

function bridge(): NativePushBridge | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = (
      window as typeof window & { DiewishReminders?: Partial<NativePushBridge> }
    ).DiewishReminders;
    if (
      !value ||
      typeof value.isAvailable !== "function" ||
      typeof value.pushToken !== "function" ||
      typeof value.ensurePushToken !== "function" ||
      typeof value.appVersion !== "function"
    ) return undefined;
    return value as NativePushBridge;
  } catch {
    return undefined;
  }
}

let lastRegistration = "";

/**
 * Keeps the Android FCM token bound to the current authenticated account and
 * consumes one pending, allowlisted notification route only after auth/router
 * initialization has completed.
 */
export function PushDeviceSync() {
  const { status, user } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (status !== "authenticated" || !user?.id) {
      // Logout must allow the same account/token pair to register again later,
      // because the server-side device binding is explicitly disabled at logout.
      lastRegistration = "";
      return;
    }
    const native = bridge();
    if (!native || !native.isAvailable()) return;

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;
    let syncing = false;

    const sync = async () => {
      if (cancelled || syncing) return;
      syncing = true;
      attempts += 1;
      try {
        native.ensurePushToken();
        const token = native.pushToken().trim();
        if (token) {
          const registrationKey = `${user.id}:${token}`;
          if (lastRegistration !== registrationKey) {
            await notificationClient.registerDevice({
              token,
              platform: "android",
              appVersion: native.appVersion() || undefined,
            });
            lastRegistration = registrationKey;
          }
          return;
        }
      } catch {
        // Token delivery is best-effort and must never block the app shell.
      } finally {
        syncing = false;
      }
      if (!cancelled && attempts < 12) timer = window.setTimeout(() => void sync(), 1500);
    };

    const syncOnResume = () => {
      attempts = 0;
      void sync();
    };
    const syncOnVisibility = () => {
      if (document.visibilityState === "visible") syncOnResume();
    };

    void sync();
    window.addEventListener("focus", syncOnResume);
    document.addEventListener("visibilitychange", syncOnVisibility);
    const refreshTimer = window.setInterval(syncOnResume, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncOnResume);
      document.removeEventListener("visibilitychange", syncOnVisibility);
      window.clearInterval(refreshTimer);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [status, user?.id]);

  React.useEffect(() => {
    if (status !== "authenticated" || !user?.id || !user.onboardingCompleted) return;
    const native = bridge();
    if (
      !native ||
      !native.isAvailable() ||
      typeof native.pendingNotificationPath !== "function" ||
      typeof native.clearPendingNotificationPath !== "function"
    ) return;

    const consumePendingTarget = () => {
      try {
        const raw = native.pendingNotificationPath?.().trim() ?? "";
        if (!raw) return;
        const target = SAFE_NOTIFICATION_TARGETS.has(raw) ? raw : "/dashboard";
        native.clearPendingNotificationPath?.();
        router.push(target);
      } catch {
        // A stale/partial native bridge must never break authenticated routing.
      }
    };

    consumePendingTarget();
    window.addEventListener("focus", consumePendingTarget);
    const timer = window.setTimeout(consumePendingTarget, 250);
    return () => {
      window.removeEventListener("focus", consumePendingTarget);
      window.clearTimeout(timer);
    };
  }, [router, status, user?.id, user?.onboardingCompleted]);

  return null;
}
