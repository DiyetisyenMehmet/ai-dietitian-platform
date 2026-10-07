"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { getNotificationCenterSnapshot } from "@/infrastructure/notifications/notification-center";
import { ThemeToggle } from "@/presentation/components/layout/theme-toggle";
import { formatLongDate, getGreeting } from "@/shared/lib/format";

interface DashboardHomeHeaderProps {
  userName: string;
}

/** Dashboard-owned top bar so the home screen can stay personal without changing the shared app header. */
function formatBuildStamp(raw: string | undefined): string {
  if (!raw) return "bekleniyor";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(",", "");
}

const DASHBOARD_BUILD_STAMP = process.env.NEXT_PUBLIC_DIEWISH_BUILD_STAMP;

export function DashboardHomeHeader({ userName }: DashboardHomeHeaderProps) {
  const [now, setNow] = React.useState<Date | null>(null);
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => setNow(new Date()), []);

  React.useEffect(() => {
    let active = true;
    const sync = () => {
      void getNotificationCenterSnapshot()
        .then((snapshot) => {
          if (active) setUnreadCount(snapshot.unreadCount);
        })
        .catch(() => undefined);
    };
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
    const timer = window.setInterval(sync, 30_000);
    return () => {
      active = false;
      window.removeEventListener("focus", sync);
      window.removeEventListener("diewish:notification-state", onState);
      window.clearInterval(timer);
    };
  }, []);

  const normalizedName = userName.trim();
  const displayName = normalizedName ? normalizedName.split(/\s+/)[0] : "Diewish";
  const buildStampLabel = formatBuildStamp(DASHBOARD_BUILD_STAMP);

  return (
    <section
      className="relative"
      aria-label="Ana sayfa özeti"
      data-dashboard-home-header
    >
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <h1 className="min-w-0 flex-1 whitespace-nowrap py-0.5 pr-1 text-[16px] font-bold leading-[1.2] tracking-tight min-[360px]:text-[19px] min-[400px]:text-[20px] min-[430px]:text-[21px] sm:text-[28px]" data-dashboard-greeting>
          {now ? getGreeting(now) : "Merhaba"}, {displayName} <span className="inline-block translate-y-[0.03em] text-[0.95em] leading-none" data-dashboard-greeting-emoji aria-hidden="true">👋</span>
        </h1>

        <div className="flex shrink-0 items-center gap-0.5" data-dashboard-header-actions>
          <div className="flex size-9 items-center justify-center rounded-xl border border-border bg-card shadow-sm sm:size-10 [&_button]:size-9 [&_button]:rounded-xl [&_svg]:size-4 sm:[&_button]:size-10">
            <ThemeToggle />
          </div>
          <Link
            href="/notifications"
            aria-label={unreadCount > 0 ? `Bildirim Merkezi, ${unreadCount} okunmamış` : "Bildirim Merkezi"}
            className="relative flex size-9 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-10"
          >
            <Bell className="size-4" aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                className="absolute -right-1 -top-1 flex min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground shadow-sm"
                aria-hidden="true"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      <div
        className="mt-0.5 flex min-w-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-right min-[360px]:flex-nowrap min-[360px]:whitespace-nowrap"
        data-dashboard-header-info
      >
        <p className="text-[10px] font-medium leading-tight text-muted-foreground sm:text-[11px]">
          {now ? formatLongDate(now) : "\u00a0"}
        </p>
        <span className="text-[9px] text-muted-foreground/40" aria-hidden="true">
          •
        </span>
        <p
          className="text-[9px] font-medium leading-tight tracking-[0.01em] text-muted-foreground/55 sm:text-[10px]"
          data-dashboard-build-stamp={DASHBOARD_BUILD_STAMP ?? "unknown"}
        >
          Güncelleme: {buildStampLabel}
        </p>
      </div>
    </section>
  );
}
