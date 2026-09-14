"use client";

import * as React from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/application/auth/auth-store";
import { useSubscription } from "@/application/payments/subscription-store";
import { notificationClient } from "@/infrastructure/notifications/notification-client";
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

export interface NutritionReminderEntry {
  id: string;
  at: number;
}

function cancelNutrition(bridge: NativeReminderBridge): void {
  if (bridge.cancelNutrition) bridge.cancelNutrition();
  else bridge.cancelAll();
}

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
  const [permission, setPermission] = React.useState<string>("unavailable");
  const paid = subscription.tier === "PREMIUM" || subscription.tier === "PREMIUM_PLUS";
  const userId = user?.id ?? "";

  const syncPermission = React.useCallback(() => {
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
  }, []);

  React.useEffect(() => {
    if (!userId) return;
    syncPermission();
    void notificationClient
      .getPreferences()
      .then(({ preferences }) => setEnabled(preferences.mealReminders))
      .catch(() => toast.error("Öğün bildirim tercihi yüklenemedi."))
      .finally(() => setPreferenceLoading(false));
  }, [syncPermission, userId]);

  React.useEffect(() => {
    if (!available || !userId || subscriptionLoading) return;
    const bridge = window.DiewishReminders;
    if (!bridge) return;

    // Entitlement is revalidated by the backend for plan-management calls. For
    // local reminders, also fail closed on the client so a FREE session cannot
    // retain alarms scheduled by a previous paid session/account.
    if (!paid || completed) {
      cancelNutrition(bridge);
      return;
    }

    if (!enabled || permission !== "granted") return;
    const now = Date.now();
    const future = entries
      .filter((entry) => entry.at > now)
      .slice(0, 240)
      .map((entry) => ({ id: entry.id.slice(0, 96), at: entry.at }));
    bridge.replaceSchedule(JSON.stringify(future));
  }, [available, completed, enabled, entries, paid, permission, subscriptionLoading, userId]);

  React.useEffect(() => {
    if (!enabled || permission === "granted" || !available) return;
    const refresh = () => syncPermission();
    window.addEventListener("focus", refresh);
    const timers = [800, 1800, 3500].map((delay) => window.setTimeout(refresh, delay));
    return () => {
      window.removeEventListener("focus", refresh);
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
              Yerel öğün bildirimleri Diewish Android uygulamasında kullanılabilir.
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
    if (!bridge || !userId) return;
    if (enabled) {
      setEnabled(false);
      cancelNutrition(bridge);
      try {
        await notificationClient.updatePreferences({ mealReminders: false });
        toast.success("Öğün hatırlatmaları kapatıldı");
      } catch {
        setEnabled(true);
        toast.error("Öğün bildirimi tercihi kaydedilemedi.");
      }
      return;
    }

    setEnabled(true);
    try {
      await notificationClient.updatePreferences({ mealReminders: true });
    } catch {
      setEnabled(false);
      toast.error("Öğün bildirimi tercihi kaydedilemedi.");
      return;
    }
    const status = syncPermission();
    if (status !== "granted") {
      bridge.requestPermission();
      toast.message("Bildirim izni verildiğinde öğün hatırlatmaları otomatik açılacak.");
    } else {
      toast.success("Öğün hatırlatmaları açıldı");
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
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
                    ? "Hatırlatmalar açık, ancak Android bildirim izni bekleniyor."
                    : "Öğün saatlerinde yalnızca bu cihazda, hassas sağlık ayrıntısı içermeyen bildirimler al."}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant={enabled ? "secondary" : "outline"}
          size="sm"
          disabled={completed}
          aria-pressed={enabled}
          onClick={() => void toggle()}
        >
          {enabled ? "Kapat" : "Aç"}
        </Button>
      </div>
    </div>
  );
}
