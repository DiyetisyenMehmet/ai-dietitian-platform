"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { CircularProgress } from "@/presentation/components/ui/circular-progress";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { useHealthScore } from "@/application/health/health-score";
import type { ScoreTrend } from "@/domain/health/types";

const TREND_META: Record<ScoreTrend, { icon: typeof TrendingUp; label: string; className: string }> = {
  up: { icon: TrendingUp, label: "Yükseliyor", className: "text-emerald-600 dark:text-emerald-400" },
  down: { icon: TrendingDown, label: "Düşüyor", className: "text-amber-600 dark:text-amber-400" },
  flat: { icon: Minus, label: "Sabit", className: "text-muted-foreground" },
};

/**
 * The dynamic Health Score control — a single 0–100 number with its trend,
 * a plain-language reason and how to improve. Expands to reveal the weighted
 * factor breakdown so the score never feels like a black box.
 */
export function HealthScoreSection() {
  const health = useHealthScore();
  const [open, setOpen] = React.useState(false);
  const trend = TREND_META[health.trend];
  const TrendIcon = trend.icon;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Sağlık Skorun</h3>
        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", trend.className)}>
          <TrendIcon className="size-3.5" aria-hidden="true" />
          {trend.label}
          {health.delta !== 0 && (
            <span className="tabular-nums">
              ({health.delta > 0 ? "+" : ""}
              {health.delta})
            </span>
          )}
        </span>
      </div>

      <Card className="shadow-soft">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-4">
            <CircularProgress value={health.score} size={104} strokeWidth={11}>
              <span className="text-2xl font-bold tabular-nums">{health.score}</span>
              <span className="text-[10px] font-medium text-muted-foreground">/ 100</span>
            </CircularProgress>

            <div className="min-w-0 flex-1">
              <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {health.band}
              </span>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{health.reason}</p>
            </div>
          </div>

          {health.improvements.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {health.improvements.map((imp) =>
                imp.href ? (
                  <Link
                    key={imp.label}
                    href={imp.href}
                    className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    {imp.label}
                  </Link>
                ) : (
                  <span
                    key={imp.label}
                    className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium"
                  >
                    {imp.label}
                  </span>
                ),
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={open}
          >
            {open ? "Ayrıntıları gizle" : "Skor nasıl hesaplanıyor?"}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
          </button>

          {open && (
            <ul className="space-y-3 border-t border-border pt-3">
              {health.factors.map((f) => {
                const Icon = healthIcon(f.icon);
                return (
                  <li key={f.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        {f.label}
                        <span className="text-muted-foreground">· ağırlık %{Math.round(f.weight * 100)}</span>
                      </span>
                      <span className="tabular-nums font-semibold">{f.value}</span>
                    </div>
                    <ProgressBar value={f.value} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
