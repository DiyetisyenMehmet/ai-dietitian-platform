"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAuth } from "@/application/auth/auth-store";
import {
  buildWellnessReminderSchedule,
  notificationRegistrationKey,
  resolvePendingNotificationTarget,
} from "@/infrastructure/notifications/notification-lifecycle";
import { notificationClient } from "@/infrastructure/notifications/notification-client";
import {
  ensureWebPushToken,
  isWebPushSupported,
  subscribeWebPushMessages,
  webPushCachedToken,
  webPushPermissionStatus,
} from "@/infrastructure/notifications/web-push";

interface NativePushBridge {
  isAvailable(): boolean;
  pushToken(): string;
  ensurePushToken(): void;
  appVersion(): string;
  pendingNotificationPath?(): string;
  clearPendingNotificationPath?(): void;
  replaceWellnessSchedule?(scheduleJson: string): number;
  cancelWellness?(): void;
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

function isNativePushAvailable(
  native: NativePushBridge | undefined,
): native is NativePushBridge {
  if (!native) return false;
  try {
    return native.isAvailable();
  } catch {
    // Android JavascriptInterface calls are optional infrastructure. A bridge
    // failure must never take down the authenticated React shell.
    return false;
  }
}

let lastRegistration = "";
let lastWebRegistration = "";
let lastWellnessSync = "";

/**
 * Keeps Android push/local reminder state bound to the current authenticated
 * account and consumes one pending, allowlisted notification route only after
 * auth/router initialization has completed.
 */
export function PushDeviceSync() {
  const { status, user } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (status !== "authenticated" || !user?.id) {
      lastRegistration = "";
      lastWellnessSync = "";
      return;
    }
    const native = bridge();
    if (!isNativePushAvailable(native)) return;

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;
    let tokenSyncing = false;
    let wellnessSyncing = false;

    const syncToken = async () => {
      if (cancelled || tokenSyncing) return;
      tokenSyncing = true;
      attempts += 1;
      try {
        native.ensurePushToken();
        const token = native.pushToken().trim();
        if (token) {
          const registrationKey = notificationRegistrationKey(user.id, token);
          if (registrationKey && lastRegistration !== registrationKey) {
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
        tokenSyncing = false;
      }
      if (!cancelled && attempts < 12) timer = window.setTimeout(() => void syncToken(), 1500);
    };

    const syncWellness = async () => {
      if (
        cancelled ||
        wellnessSyncing ||
        typeof native.replaceWellnessSchedule !== "function" ||
        typeof native.cancelWellness !== "function"
      ) return;
      wellnessSyncing = true;
      try {
        let { preferences } = await notificationClient.getPreferences();
        const timezoneOffsetMinutes = new Date().getTimezoneOffset();
        if (preferences.timezoneOffsetMinutes !== timezoneOffsetMinutes) {
          ({ preferences } = await notificationClient.updatePreferences({ timezoneOffsetMinutes }));
        }

        const signature = JSON.stringify([
          user.id,
          timezoneOffsetMinutes,
          preferences.waterReminders,
          preferences.waterReminderTime,
          preferences.activityReminders,
          preferences.activityReminderTime,
          preferences.sleepReminders,
          preferences.sleepReminderTime,
        ]);
        if (signature === lastWellnessSync) return;

        const schedule = buildWellnessReminderSchedule(preferences);
        if (schedule.length === 0) native.cancelWellness?.();
        else native.replaceWellnessSchedule?.(JSON.stringify(schedule));
        lastWellnessSync = signature;
      } catch {
        // A network failure leaves the last valid native schedule untouched.
      } finally {
        wellnessSyncing = false;
      }
    };

    const syncOnResume = () => {
      attempts = 0;
      void syncToken();
      void syncWellness();
    };
    const syncOnVisibility = () => {
      if (document.visibilityState === "visible") syncOnResume();
    };

    void syncToken();
    void syncWellness();
    window.addEventListener("focus", syncOnResume);
    document.addEventListener("visibilitychange", syncOnVisibility);
    const refreshTimer = window.setInterval(() => void syncToken(), 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncOnResume);
      document.removeEventListener("visibilitychange", syncOnVisibility);
      window.clearInterval(refreshTimer);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [status, user?.id]);

  React.useEffect(() => {
    if (status !== "authenticated" || !user?.id) {
      lastWebRegistration = "";
      return;
    }
    const native = bridge();
    if (isNativePushAvailable(native) || !isWebPushSupported() || webPushPermissionStatus() !== "granted") {
      return;
    }

    let cancelled = false;
    let syncing = false;

    const syncWebToken = async () => {
      if (cancelled || syncing) return;
      syncing = true;
      try {
        const previousToken = webPushCachedToken();
        const token = await ensureWebPushToken(false);
        if (!token || cancelled) return;

        if (previousToken && previousToken !== token) {
          await notificationClient.unregisterDevice(previousToken).catch(() => undefined);
        }

        const registrationKey = notificationRegistrationKey(user.id, token);
        if (registrationKey && registrationKey !== lastWebRegistration) {
          await notificationClient.registerDevice({ token, platform: "web" });
          lastWebRegistration = registrationKey;
        }
      } catch {
        // Browser push remains best-effort; auth and app navigation stay usable.
      } finally {
        syncing = false;
      }
    };

    const syncOnVisibility = () => {
      if (document.visibilityState === "visible") void syncWebToken();
    };

    void syncWebToken();
    window.addEventListener("focus", syncWebToken);
    document.addEventListener("visibilitychange", syncOnVisibility);
    const refreshTimer = window.setInterval(() => void syncWebToken(), 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncWebToken);
      document.removeEventListener("visibilitychange", syncOnVisibility);
      window.clearInterval(refreshTimer);
    };
  }, [status, user?.id]);

  React.useEffect(() => {
    if (status !== "authenticated" || !user?.id) return;
    const native = bridge();
    if (isNativePushAvailable(native)) return;

    return subscribeWebPushMessages((message) => {
      toast(message.title, {
        description: message.body,
        action: {
          label: "Aç",
          onClick: () => router.push(message.target),
        },
      });
    });
  }, [router, status, user?.id]);

  React.useEffect(() => {
    const canNavigate =
      status === "authenticated" && Boolean(user?.id) && user?.onboardingCompleted === true;
    if (!canNavigate) return;
    const native = bridge();
    if (
      !isNativePushAvailable(native) ||
      typeof native.pendingNotificationPath !== "function" ||
      typeof native.clearPendingNotificationPath !== "function"
    ) return;

    const consumePendingTarget = () => {
      try {
        const target = resolvePendingNotificationTarget(
          native.pendingNotificationPath?.(),
          canNavigate,
        );
        if (!target) return;
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
