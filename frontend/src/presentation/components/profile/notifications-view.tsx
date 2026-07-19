"use client";

import * as React from "react";
import { toast } from "sonner";

import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { useAccount, accountStore } from "@/application/account/account-store";
import { NOTIFICATION_PREFERENCES } from "@/domain/account/types";
import type { NotificationPreferences } from "@/domain/account/types";

/** An accessible on/off toggle switch (no external Switch primitive needed). */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** Notification-preferences screen. Persists to the local account store. */
export function NotificationsView() {
  const { notifications } = useAccount();

  const onToggle = (key: keyof NotificationPreferences, next: boolean) => {
    accountStore.setNotifications({ [key]: next });
    toast.success(next ? "Bildirim açıldı." : "Bildirim kapatıldı.");
  };

  return (
    <div className="space-y-4">
      <p className="px-1 text-sm text-muted-foreground">
        Koçundan almak istediğin hatırlatmaları ve özetleri buradan yönet. Tercihlerin bu cihazda
        saklanır.
      </p>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {NOTIFICATION_PREFERENCES.map((pref) => (
            <div key={pref.key} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{pref.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{pref.description}</p>
              </div>
              <Toggle
                checked={notifications[pref.key]}
                onChange={(next) => onToggle(pref.key, next)}
                label={pref.label}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
