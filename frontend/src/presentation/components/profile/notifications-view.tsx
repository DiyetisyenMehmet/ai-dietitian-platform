"use client";

import * as React from "react";
import { BellRing, Check, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { NOTIFICATION_PREFERENCES, type NotificationPreferences } from "@/domain/account/types";
import { notificationClient } from "@/infrastructure/notifications/notification-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { Input } from "@/presentation/components/ui/input";

type ToggleKey = (typeof NOTIFICATION_PREFERENCES)[number]["key"];
type TimedKey = "waterReminders" | "activityReminders" | "sleepReminders" | "weeklySummary";

interface NativeReminderBridge {
  isAvailable(): boolean;
  permissionStatus(): string;
  requestPermission(): void;
  replaceWellnessSchedule(scheduleJson: string): number;
  cancelWellness(): void;
  showTestNotification(): boolean;
}

interface ReminderEntry {
  id: string;
  at: number;
  type: "water" | "activity" | "sleep" | "weekly";
}

const TIME_FIELDS: Partial<Record<TimedKey, keyof NotificationPreferences>> = {
  waterReminders: "waterReminderTime",
  activityReminders: "activityReminderTime",
  sleepReminders: "sleepReminderTime",
  weeklySummary: "weeklySummaryTime",
};

function nativeBridge(): NativeReminderBridge | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    // Android WebView exposes JavaScriptInterface objects through a proxy. Older
    // Diewish APKs do not contain the wellness methods and may throw while an
    // unknown method is inspected, so capability detection itself must be safe.
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
    if (date.getDay() === preferences.weeklySummaryDay) {
      add(preferences.weeklySummary, preferences.weeklySummaryTime, "weekly");
    }
  }
  return schedule;
}

function isTimedKey(key: ToggleKey): key is TimedKey {
  return key in TIME_FIELDS;
}

export function NotificationsView() {
  const [preferences, setPreferences] = React.useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [nativeAvailable, setNativeAvailable] = React.useState(false);
  const [permission, setPermission] = React.useState("unavailable");

  const syncNative = React.useCallback((next: NotificationPreferences) => {
    try {
      const bridge = nativeBridge();
      if (!bridge || !bridge.isAvailable()) return;
      const entries = buildSchedule(next);
      if (entries.length === 0) bridge.cancelWellness();
      else bridge.replaceWellnessSchedule(JSON.stringify(entries));
    } catch {
      // A stale/partial Android bridge must never crash the web settings page.
    }
  }, []);

  const refreshPermission = React.useCallback(() => {
    try {
      const bridge = nativeBridge();
      const available = Boolean(bridge && bridge.isAvailable());
      setNativeAvailable(available);
      setPermission(available && bridge ? bridge.permissionStatus() : "unavailable");
    } catch {
      setNativeAvailable(false);
      setPermission("unavailable");
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

  const patchPreference = async (key: string, update: Partial<NotificationPreferences>) => {
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

  const toggle = async (key: ToggleKey) => {
    if (!preferences) return;
    const enabled = !preferences[key];
    if (enabled && nativeAvailable && permission !== "granted") nativeBridge()?.requestPermission();
    await patchPreference(key, { [key]: enabled });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Bildirim tercihleri yükleniyor…
        </CardContent>
      </Card>
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
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BellRing className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Bildirim tercihleri</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Yalnızca açtığın hatırlatmalar gönderilir. Tercihlerin Diewish hesabında saklanır.
              </p>
            </div>
          </div>

          {NOTIFICATION_PREFERENCES.map((item) => {
            const enabled = preferences[item.key];
            const timeField = isTimedKey(item.key) ? TIME_FIELDS[item.key] : undefined;
            return (
              <div key={item.key} className="rounded-2xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={item.label}
                    disabled={savingKey !== null}
                    onClick={() => void toggle(item.key)}
                    className={`mt-0.5 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                  >
                    <span
                      className={`flex size-5 items-center justify-center rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`}
                    >
                      {enabled && <Check className="size-3 text-primary" aria-hidden="true" />}
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                    {enabled && timeField && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="text-xs font-medium" htmlFor={`time-${item.key}`}>
                          Saat
                        </label>
                        <Input
                          id={`time-${item.key}`}
                          type="time"
                          className="h-9 w-32"
                          value={String(preferences[timeField])}
                          disabled={savingKey !== null}
                          onChange={(event) =>
                            setPreferences({ ...preferences, [timeField]: event.target.value })
                          }
                          onBlur={(event) =>
                            void patchPreference(String(timeField), {
                              [timeField]: event.target.value,
                            })
                          }
                        />
                        {item.key === "weeklySummary" && (
                          <select
                            aria-label="Haftalık özet günü"
                            className="h-9 rounded-xl border border-input bg-background px-2 text-xs"
                            value={preferences.weeklySummaryDay}
                            onChange={(event) =>
                              void patchPreference("weeklySummaryDay", {
                                weeklySummaryDay: Number(event.target.value),
                              })
                            }
                          >
                            <option value={0}>Pazar</option>
                            <option value={1}>Pazartesi</option>
                            <option value={2}>Salı</option>
                            <option value={3}>Çarşamba</option>
                            <option value={4}>Perşembe</option>
                            <option value={5}>Cuma</option>
                            <option value={6}>Cumartesi</option>
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Cihaz bildirimi</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {nativeAvailable
                  ? permission === "granted"
                    ? "Android bildirim izni açık."
                    : "Android bildirim izni bekleniyor."
                  : "Gerçek zamanlı yerel hatırlatmalar Diewish Android uygulamasında çalışır."}
              </p>
            </div>
          </div>
          {nativeAvailable && permission !== "granted" && (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => nativeBridge()?.requestPermission()}
            >
              Bildirim izni ver
            </Button>
          )}
          {nativeAvailable && permission === "granted" && (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                const shown = nativeBridge()?.showTestNotification();
                if (shown) toast.success("Test bildirimi gönderildi");
                else toast.error("Test bildirimi gösterilemedi");
              }}
            >
              Test bildirimi gönder
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
