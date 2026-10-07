"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BellRing, Info, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { NOTIFICATION_PREFERENCES, type NotificationPreferences } from "@/domain/account/types";
import { syncWellnessReminderSchedule } from "@/infrastructure/notifications/native-wellness";
import { notificationClient } from "@/infrastructure/notifications/notification-client";
import {
  ensureWebPushToken,
  isStagingNotificationHost,
  isWebPushSupported,
  webPushPermissionStatus,
  type WebPushPermission,
} from "@/infrastructure/notifications/web-push";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { Modal, ModalContent } from "@/presentation/components/ui/modal";
import {
  NotificationPreferenceCard,
  NotificationPreferenceDetail,
  type ToggleKey,
} from "./notification-preference-category";

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

function nativeBridge(): NativeReminderBridge | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    // Android WebView exposes JavaScriptInterface objects through a proxy. Older
    // Diewish APKs do not contain the wellness methods and may throw while an
    // unknown method is inspected, so capability detection itself must be safe.
    const bridge = (window as typeof window & { DiewishReminders?: Partial<NativeReminderBridge> })
      .DiewishReminders;
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

export function NotificationsView() {
  const router = useRouter();
  const [preferences, setPreferences] = React.useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [selectedKey, setSelectedKey] = React.useState<ToggleKey | null>(null);
  const saveLock = React.useRef(false);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [savedKey, setSavedKey] = React.useState<string | null>(null);
  const [nativeAvailable, setNativeAvailable] = React.useState(false);
  const [permission, setPermission] = React.useState("unavailable");
  const [exactAlarm, setExactAlarm] = React.useState("unavailable");
  const [webAvailable, setWebAvailable] = React.useState(false);
  const [webPermission, setWebPermission] = React.useState<WebPushPermission>("unsupported");

  const syncNative = syncWellnessReminderSchedule;

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
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
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
        if (cancelled) return;
        setPreferences(next);
        syncNative(next);
      })
      .catch(() => {
        if (!cancelled)
          setLoadError(
            "Bildirim tercihleri yüklenemedi. Bağlantını kontrol edip tekrar deneyebilirsin.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshPermission, syncNative, loadAttempt]);

  React.useEffect(() => {
    const onFocus = () => refreshPermission();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshPermission]);

  const patchPreference = async (key: string, update: Partial<NotificationPreferences>) => {
    if (!preferences || saveLock.current) return false;
    saveLock.current = true;
    setSaveError(null);
    setSavedKey(null);
    setSavingKey(key);
    try {
      const { preferences: next } = await notificationClient.updatePreferences(update);
      setPreferences(next);
      syncNative(next);
      setSavedKey(key);
      window.setTimeout(() => {
        setSavedKey((current) => (current === key ? null : current));
      }, 2200);
      toast.success("Bildirim tercihi kaydedildi");
      return true;
    } catch {
      setSaveError("Tercihin kaydedilemedi. Kayıtlı ayarın korundu; tekrar deneyebilirsin.");
      toast.error("Bildirim tercihi kaydedilemedi.");
      return false;
    } finally {
      saveLock.current = false;
      setSavingKey(null);
    }
  };

  const toggle = async (key: ToggleKey) => {
    if (!preferences || saveLock.current || savingKey !== null) return;
    const enabled = !preferences[key];
    const saved = await patchPreference(key, { [key]: enabled });
    if (saved && enabled && nativeAvailable && permission !== "granted") {
      try {
        nativeBridge()?.requestPermission();
      } catch {
        refreshPermission();
      }
    }
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
      <div role="status" aria-busy="true" className="space-y-3">
        <p className="text-sm text-muted-foreground">Bildirim tercihleri yükleniyor…</p>
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="h-32 animate-pulse rounded-2xl border border-border bg-muted/50 motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }
  if (!preferences) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          <p role="alert" className="text-sm leading-relaxed text-destructive">
            {loadError ?? "Bildirim tercihleri şu anda kullanılamıyor."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            Tekrar dene
          </Button>
        </CardContent>
      </Card>
    );
  }

  const selectedItem = NOTIFICATION_PREFERENCES.find((item) => item.key === selectedKey);

  return (
    <div className="space-y-4" data-notification-preferences>
      <div className="flex items-start gap-3 rounded-2xl bg-primary/5 p-4">
        <BellRing className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Yalnızca istediğin hatırlatmaları aç. Programı görmek ve düzenlemek için kartın altındaki
          özete dokun.
        </p>
      </div>
      {saveError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
        >
          {saveError}
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {savingKey
          ? "Bildirim tercihi kaydediliyor…"
          : savedKey
            ? "Bildirim tercihi kaydedildi."
            : ""}
      </p>
      <div className="space-y-3" aria-label="Bildirim kategorileri">
        {NOTIFICATION_PREFERENCES.map((item) => (
          <NotificationPreferenceCard
            key={item.key}
            item={item}
            preferences={preferences}
            busy={savingKey !== null}
            saving={savingKey === item.key}
            onToggle={() => void toggle(item.key)}
            onOpen={() => {
              setSaveError(null);
              if (item.key === "waterReminders") router.push("/profile/notifications/water");
              else setSelectedKey(item.key);
            }}
          />
        ))}
      </div>
      <div className="flex items-start gap-2 rounded-2xl bg-primary/5 p-4 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Tercihlerin Diewish hesabında saklanır. Cihazında bildirim alabilmek için bildirim izninin
          de açık olması gerekir.
        </p>
      </div>
      <Modal
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) setSelectedKey(null);
        }}
      >
        <ModalContent variant="centered">
          {selectedItem && (
            <NotificationPreferenceDetail
              key={selectedItem.key}
              item={selectedItem}
              preferences={preferences}
              busy={savingKey !== null}
              error={saveError}
              onToggle={() => void toggle(selectedItem.key)}
              onSave={(update) => patchPreference(selectedItem.key, update)}
            />
          )}
        </ModalContent>
      </Modal>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Cihaz bildirimi</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {nativeAvailable
                  ? permission === "granted"
                    ? exactAlarm === "required"
                      ? "Android bildirim izni açık. Zamanında hatırlatmalar için Alarmlar ve hatırlatıcılar erişimi gerekli."
                      : exactAlarm === "granted"
                        ? "Android bildirim ve tam zamanlı hatırlatıcı izinleri açık."
                        : "Android bildirim izni açık."
                    : permission === "denied"
                      ? "Android bildirim izni kapalı. Cihaz ayarlarından Diewish bildirimlerine izin verebilirsin."
                      : "Android bildirim izni bekleniyor."
                  : webAvailable
                    ? webPermission === "granted"
                      ? "Tarayıcı bildirim izni açık."
                      : webPermission === "denied"
                        ? "Tarayıcı bildirim izni kapalı. Tarayıcının site ayarlarından Diewish bildirimlerine izin verebilirsin."
                        : "Tarayıcı bildirim izni bekleniyor."
                    : "Bu tarayıcı gerçek zamanlı bildirimleri desteklemiyor."}
              </p>
            </div>
          </div>
          {nativeAvailable && permission !== "granted" && (
            <Button
              className="w-full"
              variant="outline"
              disabled={savingKey !== null}
              onClick={() => {
                try {
                  nativeBridge()?.requestPermission();
                } catch {
                  refreshPermission();
                }
              }}
            >
              {permission === "denied" ? "Bildirim iznini kontrol et" : "Bildirim izni ver"}
            </Button>
          )}
          {!nativeAvailable && webAvailable && webPermission !== "granted" && (
            <Button
              className="w-full"
              variant="outline"
              disabled={savingKey !== null || webPermission === "denied"}
              onClick={() => void enableWebPush()}
            >
              Tarayıcı bildirimlerini etkinleştir
            </Button>
          )}
          {nativeAvailable && permission === "granted" && exactAlarm === "required" && (
            <Button
              className="w-full"
              variant="outline"
              disabled={savingKey !== null}
              onClick={() => requestNativeExactAlarmAccess(nativeBridge())}
            >
              Tam zamanlı hatırlatıcı izni ver
            </Button>
          )}
          {nativeAvailable && permission === "granted" && (
            <Button
              className="w-full"
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
              className="w-full"
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
          {isStagingNotificationHost() &&
            ((nativeAvailable && permission === "granted") ||
              (!nativeAvailable && webAvailable && webPermission === "granted")) && (
              <Button
                className="w-full"
                variant="outline"
                disabled={savingKey !== null}
                onClick={() => void sendRemoteTest()}
              >
                Test bildirimi gönder
              </Button>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
