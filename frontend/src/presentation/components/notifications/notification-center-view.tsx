"use client";

import * as React from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  getNotificationCenterSnapshot,
  markNotificationCenterItemRead,
} from "@/infrastructure/notifications/notification-center";
import type { NotificationCenterItem } from "@/infrastructure/notifications/notification-lifecycle";
import { cn } from "@/shared/lib/utils";

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function NotificationCenterView() {
  const router = useRouter();
  const [items, setItems] = React.useState<NotificationCenterItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const snapshot = await getNotificationCenterSnapshot();
      setItems(snapshot.items);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const openNotification = async (item: NotificationCenterItem) => {
    const nextItems = items.map((candidate) =>
      candidate.key === item.key ? { ...candidate, read: true } : candidate,
    );
    setItems(nextItems);
    window.dispatchEvent(
      new CustomEvent("diewish:notification-state", {
        detail: { unreadCount: nextItems.filter((candidate) => !candidate.read).length },
      }),
    );
    try {
      await markNotificationCenterItemRead(item);
    } catch {
      // The related screen stays reachable if read-state sync is temporarily offline.
    }
    router.push(item.target);
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-label="Bildirimler yükleniyor">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-2xl border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <p className="font-semibold">Bildirimler yüklenemedi.</p>
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-primary hover:underline"
          onClick={() => {
            setLoading(true);
            void load();
          }}
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-border bg-card px-6 py-12 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Bell className="size-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Henüz bildirimin yok</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Diewish bildirimlerin burada düzenli bir şekilde görünecek.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3" aria-label="Bildirimler">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => void openNotification(item)}
          className={cn(
            "flex w-full items-start gap-3 rounded-2xl border p-4 text-left shadow-sm transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            item.read
              ? "border-border bg-card hover:bg-muted/40"
              : "border-primary/20 bg-primary/[0.045] hover:bg-primary/[0.075]",
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl",
              item.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
            )}
            aria-hidden="true"
          >
            {item.read ? <CheckCircle2 className="size-5" /> : <Bell className="size-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start gap-2">
              <span className="min-w-0 flex-1 font-semibold leading-snug">{item.title}</span>
              {!item.read && (
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              )}
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </span>
            <span className="mt-2 block text-xs font-medium text-muted-foreground/80">
              {formatTime(item.occurredAt)}
            </span>
          </span>
        </button>
      ))}
    </section>
  );
}
