"use client";

import * as React from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { authStore, useAuth } from "@/application/auth/auth-store";

import {
  getNotificationCenterSnapshot,
  markNotificationCenterItemRead,
  markAllNotificationCenterRead,
  type NotificationCenterSnapshot,
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
  const ownerId = useAuth().user?.id;
  const [snapshot, setSnapshot] = React.useState<NotificationCenterSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [actionError, setActionError] = React.useState(false);
  const [markingAll, setMarkingAll] = React.useState(false);
  const busy = React.useRef(false);
  const version = React.useRef(0);
  const items = snapshot && snapshot.ownerId === ownerId ? snapshot.items : [];

  const apply = React.useCallback((next: NotificationCenterSnapshot) => {
    setSnapshot(next);
    setError(!next.serverSynced);
    window.dispatchEvent(
      new CustomEvent("diewish:notification-state", {
        detail: { unreadCount: next.unreadCount, source: "notification-center" },
      }),
    );
  }, []);

  const load = React.useCallback(async () => {
    if (busy.current || !ownerId) return;
    const requestVersion = ++version.current;
    try {
      const next = await getNotificationCenterSnapshot();
      if (requestVersion === version.current && next.ownerId === ownerId) apply(next);
    } catch {
      if (requestVersion === version.current) setError(true);
    } finally {
      if (requestVersion === version.current) setLoading(false);
    }
  }, [ownerId, apply]);

  React.useEffect(() => {
    setSnapshot(null);
    setLoading(true);
    setActionError(false);
    busy.current = false;
    setMarkingAll(false);
    void load();
    const onFocus = () => void load();
    const onState = (event: Event) => {
      if ((event as CustomEvent<{ source?: string }>).detail?.source !== "notification-center")
        void load();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("diewish:notification-state", onState);
    return () => {
      version.current += 1;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("diewish:notification-state", onState);
    };
  }, [load]);

  const markAll = async () => {
    if (busy.current || !snapshot || snapshot.ownerId !== ownerId) return;
    busy.current = true;
    setMarkingAll(true);
    setActionError(false);
    const requestVersion = ++version.current;
    try {
      const next = await markAllNotificationCenterRead(snapshot);
      if (requestVersion === version.current) apply(next);
    } catch {
      if (requestVersion === version.current) {
        setActionError(true);
        // A lost response can follow a committed write. Reload actual state,
        // keeping the error instead of announcing an unverified success.
        try {
          const next = await getNotificationCenterSnapshot();
          if (requestVersion === version.current) apply(next);
        } catch {
          if (requestVersion === version.current) setError(true);
        }
      }
    } finally {
      if (requestVersion === version.current) {
        busy.current = false;
        setMarkingAll(false);
      }
    }
  };

  const openNotification = async (item: NotificationCenterItem) => {
    if (busy.current) return;
    try {
      await markNotificationCenterItemRead(item);
    } catch {
      // Navigation remains available when read-state sync is offline.
    }
    if (authStore.getSnapshot().user?.id !== ownerId) return;
    void load();
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
    <section className="space-y-3" aria-label="Bildirimler" aria-busy={markingAll}>
      {(snapshot?.unreadCount ?? 0) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {snapshot?.unreadCount} okunmamış bildirim
          </p>
          <button
            type="button"
            disabled={markingAll || error || !snapshot?.readBefore}
            onClick={() => void markAll()}
            className="min-h-11 max-w-full rounded-xl px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-50"
          >
            {markingAll ? "İşaretleniyor…" : "Tümünü okundu işaretle"}
          </button>
        </div>
      )}
      {(actionError || error) && (
        <div role="alert" className="rounded-xl border border-border bg-card p-3 text-sm">
          <p>
            {actionError
              ? "Tüm bildirimlerin okundu durumu doğrulanamadı. Listeyi kontrol edip tekrar dene."
              : "Bildirimler sunucuyla eşleştirilemedi. Lütfen tekrar dene."}
          </p>
          <button
            type="button"
            disabled={markingAll}
            onClick={() => void load()}
            className="mt-2 min-h-11 font-semibold text-primary hover:underline disabled:opacity-50"
          >
            Listeyi yenile
          </button>
        </div>
      )}
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          disabled={markingAll}
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
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                />
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
