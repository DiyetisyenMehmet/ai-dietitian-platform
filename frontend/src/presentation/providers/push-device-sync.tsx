"use client";

import * as React from "react";

import { useAuth } from "@/application/auth/auth-store";
import { notificationClient } from "@/infrastructure/notifications/notification-client";

interface NativePushBridge {
  isAvailable(): boolean;
  pushToken(): string;
  ensurePushToken(): void;
  appVersion(): string;
}

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
 * Registers the Android FCM token only after Diewish has an authenticated
 * account. Permission is deliberately not requested here; notification opt-in
 * remains an explicit user action in notification settings.
 */
export function PushDeviceSync() {
  const { status, user } = useAuth();

  React.useEffect(() => {
    if (status !== "authenticated" || !user?.id) return;
    const native = bridge();
    if (!native || !native.isAvailable()) return;

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

    const sync = async () => {
      if (cancelled) return;
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
      }
      if (!cancelled && attempts < 12) timer = window.setTimeout(sync, 1500);
    };

    void sync();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [status, user?.id]);

  return null;
}
