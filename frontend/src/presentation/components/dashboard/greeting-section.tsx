"use client";

import * as React from "react";

import { getGreeting, formatLongDate } from "@/shared/lib/format";

/** Personal, time-aware greeting with today's date. Hydration-safe. */
export function GreetingSection({ userName }: { userName: string }) {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => setNow(new Date()), []);

  return (
    <section className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">
        {now ? formatLongDate(now) : "\u00a0"}
      </p>
      <h2 className="text-2xl font-bold tracking-tight">
        {now ? getGreeting(now) : "Merhaba"}, {userName} <span aria-hidden="true">👋</span>
      </h2>
    </section>
  );
}
