"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Lightbulb, Lock } from "lucide-react";

import type { AiInsight, AiInsightSeverity } from "@/domain/health/types";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { cn } from "@/shared/lib/utils";

const SEVERITY_STYLES: Record<AiInsightSeverity, { badge: string; icon: string }> = {
  info: { badge: "bg-primary/10 text-primary", icon: "bg-primary/10 text-primary" },
  success: {
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  danger: {
    badge: "bg-red-500/10 text-red-600 dark:text-red-400",
    icon: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
};

/** Renders a list of AI insight cards, or a coaching empty state. */
export function AiInsightsPanel({ insights }: { insights: AiInsight[] }) {
  const router = useRouter();
  if (insights.length === 0) {
    return (
      <EmptyState
        icon={Lightbulb}
        title="Henüz içgörü yok"
        description="Öğünlerini ve kilonu kaydettikçe koçun sana özel değerlendirmeler hazırlayacak."
        action={{ label: "Öğün ekle", onClick: () => router.push("/meals") }}
      />
    );
  }
  return (
    <div className="space-y-3">
      {insights.map((insight) => (
        <AiInsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}

/** A single AI insight card. */
export function AiInsightCard({ insight }: { insight: AiInsight }) {
  const Icon = healthIcon(insight.icon);
  const styles = SEVERITY_STYLES[insight.severity];
  const locked = Boolean(insight.premium);

  return (
    <article
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-card",
        locked && "opacity-95",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            styles.icon,
          )}
        >
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{insight.title}</h3>
            {locked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                <Lock className="size-3" aria-hidden="true" />
                Premium
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{insight.summary}</p>

          {insight.details.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {insight.details.map((line, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <span className={cn("mt-1.5 size-1 shrink-0 rounded-full", styles.badge)} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {insight.actionLabel && insight.actionHref ? (
            <Link
              href={insight.actionHref}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              {insight.actionLabel}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
