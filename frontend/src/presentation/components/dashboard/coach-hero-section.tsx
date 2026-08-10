"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, ChevronRight } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/presentation/components/ui/button";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { formatNumber } from "@/shared/lib/format";
import { useHealthProfile } from "@/application/health/health-profile-store";
import { useWeightEntries } from "@/application/health/weight-store";
import { useProgressStats } from "@/application/health/progress-analytics";
import { useNextAction } from "@/application/health/coach";

/**
 * The dashboard's AI-Coach control center. It answers "what should I do today?"
 * with three parts: the user's current health status, today's single priority
 * (from the coach reasoning layer) and one large call-to-action button.
 */
export function CoachHeroSection() {
  const profile = useHealthProfile();
  const entries = useWeightEntries();
  const stats = useProgressStats(entries, profile.targetWeightKg);
  const action = useNextAction();

  const PriorityIcon = healthIcon(action?.icon ?? "sparkles");
  const ctaLabel = action?.actionLabel ?? "Koçla konuş";
  const ctaHref = action?.actionHref ?? "/ai";

  const statusItems: { label: string; value: string }[] = [
    { label: "Güncel kilo", value: `${formatNumber(profile.currentWeightKg)} kg` },
    {
      label: "Hedefe kalan",
      value: stats.remainingKg > 0 ? `${formatNumber(stats.remainingKg)} kg` : "Ulaşıldı",
    },
    { label: "Tamamlanan", value: `%${stats.completionPercent}` },
  ];

  return (
    <section aria-label="AI Koç" className="animate-scale-in">
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/12 via-accent to-background p-5 shadow-card sm:p-6">
        {/* Coach identity */}
        <div className="flex items-center gap-3">
          <span className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Bot className="size-6" aria-hidden="true" />
            <span className="absolute -right-0.5 -top-0.5 flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-emerald-500 ring-2 ring-background" />
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">AI Koçun</p>
            <p className="text-xs text-muted-foreground">Bugün senin için buradayım</p>
          </div>
        </div>

        {/* Current health status */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {statusItems.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-border/60 bg-card/60 p-3 text-center backdrop-blur"
            >
              <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
              <p className="mt-0.5 text-base font-bold tabular-nums">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Today's priority */}
        <div className="mt-4 rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            <span className="inline-block size-1.5 rounded-full bg-primary" aria-hidden="true" />
            Bugünün önceliği
          </p>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <PriorityIcon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{action?.title ?? "Harika gidiyorsun!"}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                {action?.message ??
                  "Bugün için özel bir görev yok. Dilersen koçunla sohbet edip planını gözden geçirebilirsin."}
              </p>
            </div>
          </div>
        </div>

        {/* Large call-to-action */}
        <Button asChild size="lg" className={cn("mt-4 w-full")}>
          <Link href={ctaHref}>
            {ctaLabel}
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
