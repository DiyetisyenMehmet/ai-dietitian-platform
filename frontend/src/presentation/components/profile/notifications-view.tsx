"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BellRing,
  CalendarClock,
  Check,
  Droplets,
  Moon,
  Smartphone,
  Sparkles,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";

import { NOTIFICATION_PREFERENCES, type NotificationPreferences } from "@/domain/account/types";
import { notificationClient } from "@/infrastructure/notifications/notification-client";
import {
  ensureWebPushToken,
  isStagingNotificationHost,
  isWebPushSupported,
  webPushPermissionStatus,
  type WebPushPermission,
} from "@/infrastructure/notifications/web-push";
import {
  DISPLAY_NOTIFICATION_PREFERENCE_KEYS,
  notificationProgramSummary,
  type DisplayNotificationPreferenceKey,
} from "@/presentation/components/profile/notification-preference-presentation";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";

interface NativeReminderBridge {
  isAvailable(): boolean;
  permissionStatus(): string;
  requestPermission(): void;
  exactAlarmStatus?(): string;
  requestExactAlarmAccess?(): void;
  scheduleTestReminder?(delaySeconds: number): boolean;
  replaceWellnessSchedule(scheduleJson: string): number;
  cancelWellness(): void;
  showTestNotification(): boolean;
}

interface ReminderEntry {
  id: string;
  at: number;
  type: "water" | "activity" | "sleep";
}

const DISPLAY_NOTIFICATION_PREFERENCES = DISPLAY_NOTIFICATION_PREFERENCE_KEYS.map((key) => {
  const item = NOTIFICATION_PREFERENCES.find((candidate) => candidate.key === key);
  if (!item) throw new Error(`Missing notification preference metadata: ${key}`);
  return { ...item, key };
});

const PREFERENCE_ICONS: Record<DisplayNotificationPreferenceKey, LucideIcon> = {
  mealReminders: Utensils,
  waterReminders: Droplets,
  activityReminders: Activity,
  sleepReminders: Moon,
  weeklySummary: BarChart3,
  coachTips: Sparkles,
};

function nativeBridge(): NativeReminderBridge | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const bridge = (
      window as typeof window & { DiewishReminders?: Partial<NativeReminderBridge> }
    ).DiewishReminders;
    if (
      !bridge ||
      typeof bridge.isAvailable !== "function" ||
      typeof bridge.permissionStatus !== "function" ||
      typeof bridge.requestPermission !== "function" ||
      typeof bridge.replaceWellnessSchedule !== "function" ||
      typeof bridge.cancelWellness !== "function" ||
      typeof bridge.showTestNotification !== "function"
    ) {
      return undefined;
    }
    return bridge as NativeReminderBridge;
  } catch {
    return undefined;
  }
}

function nativeExactAlarmStatus(bridge: NativeReminderBridge | undefined): string {
  if (!bridge || typeof bridge.exactAlarmStatus !== "function") return "unavailable";
  try {
    return bridge.exactAlarmStatus();
  } catch {
    return "unavailable";
  }
}

function requestNativeExactAlarmAccess(bridge: NativeReminderBridge | undefined): void {
  if (!bridge || typeof bridge.requestExactAlarmAccess !== "function") return;
  try {
    bridge.requestExactAlarmAccess();
  } catch {
    // Older APKs can expose a partial JavascriptInterface proxy.
  }
}

function scheduleNativeTestReminder(
  bridge: NativeReminderBridge | undefined,
  delaySeconds: number,
): boolean {
  if (!bridge || typeof bridge.scheduleTestReminder !== "function") return false;
  try {
    return bridge.scheduleTestReminder(delaySeconds);
  } catch {
    return false;
  }
}

function dateAt(base: Date, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  const result = new Date(base);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function buildSchedule(preferences: NotificationPreferences): ReminderEntry[] {
  const schedule: ReminderEntry[] = [];
  const now = new Date();
  for (let day = 0; day < 30; day += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + day);
    const add = (enabled: boolean, time: string, type: ReminderEntry["type"]) => {
      if (!enabled) return;
      const at = dateAt(date, time);
      if (at.getTime() > now.getTime()) {
        schedule.push({ id: `${type}-${at.toISOString()}`, at: at.getTime(), type });
      }
    };
    add(preferences.waterReminders, preferences.waterReminderTime, "water");
    add(preferences.activityReminders, preferences.activityReminderTime, "activity");
    add(preferences.sleepReminders, preferences.sleepReminderTime, "sleep");
  }
  return schedule;
}

function PreferenceSwitch({
  label,
  enabled,
  disabled,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`${label}: ${enabled ? "açık" : "kapalı"}`}
      disabled={disabled}
      onClick={onToggle}
      className="flex min-h-11 min-w-14 shrink-0 items-start justify-center rounded-xl pt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
    >
      <span
        className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors ${
          enabled ? "bg-primary" : "bg-muted-foreground/30"
        }`}
        aria-hidden="true"
      >
        <span
          className={`flex size-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        >
          {enabled && <Check className="size-3 text-primary" />}
        </span>
      </span>
    </button>
  );
}

export function NotificationsView() {
  const [preferences, setPreferences] = React.useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [nativeAvailable, setNativeAvailable] = React.useState(false);
  const [permission, setPermission] = React.useState("unavailable");
  const [exactAlarm, setExactAlarm] = React.useState("unavailable");
  const [webAvailable, setWebAvailable] = React.useState(false);
  const [webPermission, setWebPermission] = React.useState<WebPushPermission>("unsupported");

  const syncNative = React.useCallback((next: NotificationPreferences) => {
    try {
      const bridge = nativeBridge();
      if (!bridge || !bridge.isAvailable()) return;
      const entries = buildSchedule(next);
      if (entries.length === 0) bridge.cancelWellness();
      else bridge.replaceWellnessSchedule(JSON.stringify(entries));
    } catch {
      // A stale/partial Android bridge must never crash the settings page.
    }
  }, []);

  const refreshPermission = React.useCallback(() => {
    try {
      const bridge = nativeBridge();
      const available = Boolean(bridge && bridge.isAvailable());
      setNativeAvailable(available);
      setPermission(available && bridge ? bridge.permissionStatus() : "unavailable");
      setExactAlarm(available ? nativeExactAlarmStatus(bridge) : "unavailable");
      const browserAvailable = !available && isWebPushSupported();
      setWebAvailable(browserAvailable);
      setWebPermission(browserAvailable ? webPushPermissionStatus() : "unsupported");
    } catch {
      setNativeAvailable(false);
      setPermission("unavailable");
      setExactAlarm("unavailable");
      const browserAvailable = isWebPushSupported();
      setWebAvailable(browserAvailable);
      setWebPermission(browserAvailable ? webPushPermissionStatus() : "unsupported");
    }
  }, []);

  React.useEffect(() => {
    refreshPermission();
    void notificationClient
      .getPreferences()
      .then(async ({ preferences: loaded }) => {
        const offset = new Date().getTimezoneOffset();
        const next =
          loaded.timezoneOffsetMinutes === offset
            ? loaded
            : (await notificationClient.updatePreferences({ timezoneOffsetMinutes: offset }))
                .preferences;
        setPreferences(next);
        syncNative(next);
      })
      .catch(() => toast.error("Bildirim tercihleri yüklenemedi."))
      .finally(() => setLoading(false));
  }, [refreshPermission, syncNative]);

  React.useEffect(() => {
    const onFocus = () => refreshPermission();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshPermission]);

  const patchPreference = async (
    key: DisplayNotificationPreferenceKey,
    update: Partial<NotificationPreferences>,
  ) => {
    if (!preferences) return;
    setSavingKey(key);
    try {
      const { preferences: next } = await notificationClient.updatePreferences(update);
      setPreferences(next);
      syncNative(next);
      toast.success("Bildirim tercihi kaydedildi");
    } catch {
      toast.error("Bildirim tercihi kaydedilemedi.");
    } finally {
      setSavingKey(null);
    }
  };

  const toggle = async (key: DisplayNotificationPreferenceKey) => {
    if (!preferences) return;
    const enabled = !preferences[key];
    if (enabled && nativeAvailable && permission !== "granted") nativeBridge()?.requestPermission();
    await patchPreference(key, { [key]: enabled });
  };

  const enableWebPush = async () => {
    setSavingKey("web-push");
    try {
      const token = await ensureWebPushToken(true);
      setWebPermission(webPushPermissionStatus());
      if (!token) {
        toast.error("Tarayıcı bildirim izni verilmedi.");
        return;
      }
      await notificationClient.registerDevice({ token, platform: "web" });
      toast.success("Tarayıcı bildirimleri etkinleştirildi");
    } catch {
      toast.error("Tarayıcı bildirimi etkinleştirilemedi.");
    } finally {
      setSavingKey(null);
    }
  };

  const sendRemoteTest = async () => {
    setSavingKey("remote-test");
    try {
      const result = await notificationClient.sendTestNotification();
      if (result.disposition === "delivered") {
        toast.success("Gerçek test bildirimi FCM tarafından kabul edildi");
      } else {
        toast.error(`Test bildirimi teslim edilemedi: ${result.code ?? result.disposition}`);
      }
    } catch {
      toast.error("Gerçek test bildirimi gönderilemedi.");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-label="Bildirim tercihleri yükleniyor">
        <div className="mb-5 h-10 animate-pulse rounded-xl bg-muted/60" />
        {DISPLAY_NOTIFICATION_PREFERENCE_KEYS.map((key) => (
          <div key={key} className="h-32 animate-pulse rounded-3xl border border-border/60 bg-muted/35" />
        ))}
      </div>
    );
  }

  if (!preferences) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-destructive">
          Bildirim tercihleri şu anda kullanılamıyor.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5" data-notification-preferences-screen>
      <section className="px-1" aria-label="Bildirim tercihleri açıklaması">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Sadece senin için önemli olan hatırlatmaları yönet. Tercihlerin Diewish hesabında
          güvenli şekilde saklanır.
        </p>
      </section>

      <section className="space-y-3" aria-label="Hatırlatma tercihleri">
        {DISPLAY_NOTIFICATION_PREFERENCES.map((item) => {
          const enabled = preferences[item.key];
          const Icon = PREFERENCE_ICONS[item.key];
          const programSummary = notificationProgramSummary(item.key, preferences);
          return (
            <article
              key={item.key}
              data-notification-preference-card={item.key}
              className="rounded-3xl border border-border/70 bg-card p-4 shadow-sm sm:p-5"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words text-[15px] font-semibold leading-5 text-foreground">
                        {item.label}
                      </h2>
                      <p className="mt-1 break-words text-xs leading-[1.55] text-muted-foreground">
                        {item.description}
                      </p>
                    </div>

                    <PreferenceSwitch
                      label={item.label}
                      enabled={enabled}
                      disabled={savingKey !== null}
                      onToggle={() => void toggle(item.key)}
                    />
                  </div>

                  <div className="mt-3 flex min-w-0 items-start gap-2 rounded-xl bg-muted/60 px-3 py-2">
                    <CalendarClock
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 break-words text-xs font-medium leading-4 text-muted-foreground">
                      {programSummary}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <Card className="border-border/60 bg-muted/20 shadow-none">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Smartphone className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Cihaz bildirimi</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {nativeAvailable
                  ? permission === "granted"
                    ? exactAlarm === "required"
                      ? "Android bildirim izni açık. Zamanında hatırlatmalar için Alarmlar ve hatırlatıcılar erişimi gerekli."
                      : exactAlarm === "granted"
                        ? "Android bildirim ve tam zamanlı hatırlatıcı izinleri açık."
                        : "Android bildirim izni açık."
                    : "Android bildirim izni bekleniyor."
                  : webAvailable
                    ? webPermission === "granted"
                      ? "Tarayıcı bildirim izni açık."
                      : webPermission === "denied"
                        ? "Tarayıcı bildirim izni engellenmiş."
                        : "Tarayıcı bildirim izni bekleniyor."
                    : "Bu tarayıcı gerçek zamanlı bildirimleri desteklemiyor."}
              </p>
            </div>
          </div>

          {nativeAvailable && permission !== "granted" && (
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={savingKey !== null}
              onClick={() => nativeBridge()?.requestPermission()}
            >
              Bildirim izni ver
            </Button>
          )}

          {!nativeAvailable && webAvailable && webPermission !== "granted" && (
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={savingKey !== null || webPermission === "denied"}
              onClick={() => void enableWebPush()}
            >
              Tarayıcı bildirimlerini etkinleştir
            </Button>
          )}

          {nativeAvailable && permission === "granted" && exactAlarm === "required" && (
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={savingKey !== null}
              onClick={() => requestNativeExactAlarmAccess(nativeBridge())}
            >
              Tam zamanlı hatırlatıcı izni ver
            </Button>
          )}

          {isStagingNotificationHost() && (
            <details className="rounded-2xl border border-border/60 bg-background/70 p-3">
              <summary className="cursor-pointer select-none text-xs font-semibold text-muted-foreground">
                Cihaz testleri
              </summary>
              <div className="mt-3 space-y-2">
                {nativeAvailable && permission === "granted" && (
                  <Button
                    className="min-h-11 w-full"
                    variant="outline"
                    disabled={savingKey !== null}
                    onClick={() => {
                      const shown = nativeBridge()?.showTestNotification();
                      if (shown) toast.success("Anlık yerel bildirim gösterildi");
                      else toast.error("Bildirim gösterilemedi. Android bildirim kanalını kontrol et.");
                    }}
                  >
                    Anlık yerel bildirimi test et
                  </Button>
                )}

                {nativeAvailable && permission === "granted" && exactAlarm === "granted" && (
                  <Button
                    className="min-h-11 w-full"
                    variant="outline"
                    disabled={savingKey !== null}
                    onClick={() => {
                      const scheduled = scheduleNativeTestReminder(nativeBridge(), 60);
                      if (scheduled) toast.success("1 dakika sonraya test bildirimi kuruldu");
                      else toast.error("1 dakikalık test bildirimi planlanamadı");
                    }}
                  >
                    1 dk zamanlama testi
                  </Button>
                )}

                {((nativeAvailable && permission === "granted") ||
                  (!nativeAvailable && webAvailable && webPermission === "granted")) && (
                  <Button
                    className="min-h-11 w-full"
                    variant="outline"
                    disabled={savingKey !== null}
                    onClick={() => void sendRemoteTest()}
                  >
                    Gerçek FCM test bildirimi gönder
                  </Button>
                )}
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
