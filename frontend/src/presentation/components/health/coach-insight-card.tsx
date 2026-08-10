import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { healthIcon } from "@/presentation/components/health/health-icon";
import type { CoachInsight, CoachTone } from "@/domain/health/types";

const TONE_STYLES: Record<CoachTone, { wrap: string; icon: string }> = {
  success: {
    wrap: "border-emerald-500/30 bg-emerald-500/5",
    icon: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    wrap: "border-amber-500/30 bg-amber-500/5",
    icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  nudge: {
    wrap: "border-amber-500/30 bg-amber-500/5",
    icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  info: {
    wrap: "border-primary/20 bg-primary/5",
    icon: "bg-primary/15 text-primary",
  },
};

interface CoachInsightCardProps {
  insight: CoachInsight;
  /** Hero = larger, prominent "next action". Compact = list card. */
  variant?: "hero" | "compact";
}

/** Renders a single proactive AI-coach insight with tone-based styling. */
export function CoachInsightCard({ insight, variant = "compact" }: CoachInsightCardProps) {
  const tone = TONE_STYLES[insight.tone];
  const Icon = healthIcon(insight.icon);
  const hero = variant === "hero";

  const body = (
    <div
      className={cn(
        "flex items-start gap-3.5 rounded-2xl border p-5 shadow-card transition-shadow",
        tone.wrap,
        insight.actionHref && "hover:shadow-card-hover",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl",
          tone.icon,
          hero ? "size-12" : "size-10",
        )}
      >
        <Icon className={hero ? "size-6" : "size-5"} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        {hero && (
          <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            Sıradaki adım
          </p>
        )}
        <p className={cn("font-semibold", hero ? "text-base" : "text-sm")}>{insight.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{insight.message}</p>
        {insight.actionLabel && insight.actionHref && (
          <span className="mt-2.5 inline-flex items-center gap-1 text-sm font-medium text-primary">
            {insight.actionLabel}
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );

  if (insight.actionHref) {
    return (
      <Link href={insight.actionHref} className="block focus-visible:outline-none">
        {body}
      </Link>
    );
  }
  return body;
}
