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
export function DashboardHomeHeader({ userName }: DashboardHomeHeaderProps) {
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => setNow(new Date()), []);

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
          aria-label="Bildirim ayarları"
          className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-foreground shadow-sm transition hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-11"
        >
          <Bell className="size-5" aria-hidden="true" />
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
