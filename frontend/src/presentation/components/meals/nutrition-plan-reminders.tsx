"use client";

import * as React from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/application/auth/auth-store";
import { useSubscription } from "@/application/payments/subscription-store";
import { notificationClient } from "@/infrastructure/notifications/notification-client";
import {
  cancelMealReminderSchedule,
  syncMealReminderEntries,
} from "@/infrastructure/notifications/native-meals";
import type { MealReminderEntry } from "@/domain/account/meal-reminder-plan";
import { Button } from "@/presentation/components/ui/button";

interface NativeReminderBridge {
  isAvailable(): boolean;
  permissionStatus(): "granted" | "denied" | "unavailable" | string;
  requestPermission(): void;
  replaceSchedule(scheduleJson: string): number;
  cancelNutrition?(): void;
  cancelAll(): void;
}

declare global {
  interface Window {
    DiewishReminders?: NativeReminderBridge;
  }
}

export type NutritionReminderEntry = MealReminderEntry;

interface NutritionPlanRemindersProps {
  entries: NutritionReminderEntry[];
  completed: boolean;
}

export function NutritionPlanReminders({ entries, completed }: NutritionPlanRemindersProps) {
  const { user } = useAuth();
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const [available, setAvailable] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [preferenceLoading, setPreferenceLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const saveLock = React.useRef(false);
  const [permission, setPermission] = React.useState<string>("unavailable");
  const paid = subscription.tier === "PREMIUM" || subscription.tier === "PREMIUM_PLUS";
  const userId = user?.id ?? "";

  const syncPermission = React.useCallback(() => {
    try {
      const bridge = window.DiewishReminders;
      if (!bridge?.isAvailable()) {
        setAvailable(false);
        setPermission("unavailable");
        return "unavailable";
      }
      setAvailable(true);
      const status = bridge.permissionStatus();
      setPermission(status);
      return status;
    } catch {
      setAvailable(false);
      setPermission("unavailable");
      return "unavailable";
    }
  }, []);

  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setPreferenceLoading(true);
    setEnabled(false);
    syncPermission();
    void notificationClient
      .getPreferences()
      .then(({ preferences }) => {
        if (!cancelled) setEnabled(preferences.mealReminders);
      })
      .catch(() => {
        if (!cancelled) toast.error("Öğün bildirim tercihi yüklenemedi.");
      })
      .finally(() => {
        if (!cancelled) setPreferenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [syncPermission, userId]);

  React.useEffect(() => {
    if (!available || !userId || subscriptionLoading || preferenceLoading) return;

    // Entitlement is revalidated by the backend for plan-management calls. For
    // local reminders, also fail closed on the client so a FREE session cannot
    // retain alarms scheduled by a previous paid session/account.
    if (!enabled || !paid || completed || permission !== "granted") {
      cancelMealReminderSchedule();
      return;
    }
    syncMealReminderEntries({ enabled, paid, completed, entries });
  }, [
    available,
    completed,
    enabled,
    entries,
    paid,
    permission,
    preferenceLoading,
    subscriptionLoading,
    userId,
  ]);

  React.useEffect(() => {
    if (!available) return;
    const refresh = () => syncPermission();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("diewish:notification-state", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    const timers =
      enabled && permission !== "granted"
        ? [800, 1800, 3500].map((delay) => window.setTimeout(refresh, delay))
        : [];
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("diewish:notification-state", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [available, enabled, permission, syncPermission]);

  if (subscriptionLoading || preferenceLoading) return null;

  if (!available) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Öğün hatırlatmaları</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Bu cihazda yerel öğün bildirimleri kullanılamıyor.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!paid) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Öğün hatırlatmaları</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Bu özellik Premium ve Premium Plus kullanıcıları içindir.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const toggle = async () => {
    const bridge = window.DiewishReminders;
    if (!bridge || !userId || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    const nextEnabled = !enabled;
    try {
      const { preferences } = await notificationClient.updatePreferences({
        mealReminders: nextEnabled,
      });
      if (preferences.mealReminders !== nextEnabled)
        throw new Error("Meal preference not persisted");
      setEnabled(nextEnabled);
      if (!nextEnabled) {
        cancelMealReminderSchedule();
        toast.success("Öğün hatırlatmaları kapatıldı");
        return;
      }
      const status = syncPermission();
      if (status !== "granted") {
        bridge.requestPermission();
        toast.message("Bildirim izni verildiğinde öğün hatırlatmaları otomatik açılacak.");
      } else toast.success("Öğün hatırlatmaları açıldı");
    } catch {
      toast.error("Öğün bildirimi tercihi kaydedilemedi.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  return (
    <div data-nutrition-reminders className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {enabled ? (
            <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <BellOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold">Öğün hatırlatmaları</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {completed
                ? "Tamamlanan plan için yeni bildirim planlanmaz."
                : enabled && permission === "granted"
                  ? "Planındaki gelecek öğün saatleri için bu cihazda yerel bildirimler açık."
                  : enabled
                    ? "Hatırlatmalar açık, ancak bu cihazın bildirim izni bekleniyor."
                    : "Öğün saatlerinde yalnızca bu cihazda, hassas sağlık ayrıntısı içermeyen bildirimler al."}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant={enabled ? "secondary" : "outline"}
          size="sm"
          disabled={completed || saving}
          isLoading={saving}
          aria-pressed={enabled}
          onClick={() => void toggle()}
        >
          {enabled ? "Kapat" : "Aç"}
        </Button>
      </div>
    </div>
  );
}
