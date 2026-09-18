"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, UserRound } from "lucide-react";

import { ThemeToggle } from "@/presentation/components/layout/theme-toggle";
import { formatLongDate, getGreeting } from "@/shared/lib/format";

interface DashboardHomeHeaderProps {
  userName: string;
}

/** Dashboard-owned top bar so the home screen can stay personal without changing the shared app header. */
interface NativeNotificationBadgeBridge {
  unreadNotificationCount?(): number;
}

function nativeUnreadCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const bridge = (
      window as typeof window & {
        DiewishReminders?: NativeNotificationBadgeBridge;
      }
    ).DiewishReminders;
    if (!bridge || typeof bridge.unreadNotificationCount !== "function") return 0;
    const count = Number(bridge.unreadNotificationCount());
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  } catch {
    return 0;
  }
}

export function DashboardHomeHeader({ userName }: DashboardHomeHeaderProps) {
  const [now, setNow] = React.useState<Date | null>(null);
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => setNow(new Date()), []);

  React.useEffect(() => {
    const sync = () => setUnreadCount(nativeUnreadCount());
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<{ unreadCount?: number }>).detail;
      if (typeof detail?.unreadCount === "number") {
        setUnreadCount(Math.max(0, Math.floor(detail.unreadCount)));
      } else {
        sync();
      }
    };
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("diewish:notification-state", onState);
    const timer = window.setInterval(sync, 5000);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("diewish:notification-state", onState);
      window.clearInterval(timer);
    };
  }, []);

  const displayName = userName.trim() || "Diewish";

  return (
    <section className="relative pt-1" aria-label="Ana sayfa özeti">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">
          {now ? formatLongDate(now) : "\u00a0"}
        </p>
        <h1 className="mt-3.5 break-words text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          {now ? getGreeting(now) : "Merhaba"}, {displayName} <span aria-hidden="true">👋</span>
        </h1>
      </div>

      <div className="absolute right-0 top-0 flex shrink-0 -translate-y-1 items-center gap-1 sm:gap-2">
        <div className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card shadow-sm sm:size-11 [&_button]:size-10 [&_button]:rounded-2xl sm:[&_button]:size-11">
          <ThemeToggle />
        </div>
        <Link
          href="/profile/notifications"
          aria-label={unreadCount > 0 ? `Bildirimler, ${unreadCount} okunmamış` : "Bildirim ayarları"}
          className="relative flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-foreground shadow-sm transition hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-11"
        >
          <Bell className="size-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-1 -top-1 flex min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground shadow-sm"
              aria-hidden="true"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>
        <Link
          href="/profile"
          aria-label="Profilini aç"
          className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-foreground shadow-sm transition hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-11"
        >
          <UserRound className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
