"use client";

import * as React from "react";
import { ArrowRight, Flag, TrendingDown, TrendingUp, Minus } from "lucide-react";
import Link from "next/link";

import { useHealthProfile } from "@/application/health/health-profile-store";
import { useWeightEntries } from "@/application/health/weight-store";
import { useProgressStats } from "@/application/health/progress-analytics";
import { CircularProgress } from "@/presentation/components/ui/circular-progress";
import { cn } from "@/shared/lib/utils";

/**
 * Goal Tracker — a compact, motivating summary of where the user stands
 * against their weight goal: current weight, target, remaining, an estimated
 * completion date, the weekly trend and an encouraging message.
 *
 * Reads from the shared health-profile + weight stores (session placeholder
 * data layer, backend-ready) and the pure {@link useProgressStats} analytics.
 */
export function GoalTrackerSection() {
  const profile = useHealthProfile();
  const entries = useWeightEntries();
  const stats = useProgressStats(entries, profile.targetWeightKg);

  const current = profile.currentWeightKg;
  const target = profile.targetWeightKg;
  const remaining = stats.remainingKg;
  const percent = Math.round(stats.completionPercent);

  const weekly = stats.weeklyChangeKg ?? stats.avgWeeklyChangeKg;
  const trendKind: "down" | "up" | "flat" =
    weekly == null || Math.abs(weekly) < 0.05 ? "flat" : weekly < 0 ? "down" : "up";

  // For a weight-loss goal, "down" is good; for a gain goal, "up" is good.
  const goalIsLoss = target <= profile.startWeightKg;
  const trendIsPositive =
    trendKind === "flat" ? false : goalIsLoss ? trendKind === "down" : trendKind === "up";

  const TrendIcon = trendKind === "flat" ? Minus : trendKind === "down" ? TrendingDown : TrendingUp;

  const motivation = buildMotivation({
    percent,
    remaining,
    trendIsPositive,
    trendKind,
    etaLabel: stats.estimatedTargetLabel,
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Flag className="size-[18px]" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-semibold">Hedef Takibi</h3>
        </div>
        <Link
          href="/progress"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Detaylar
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="flex items-center gap-5">
        <CircularProgress value={percent} size={104} strokeWidth={10}>
          <span className="text-xl font-bold leading-none">%{percent}</span>
          <span className="mt-1 text-[11px] text-muted-foreground">tamamlandı</span>
        </CircularProgress>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Şu an" value={`${formatKg(current)}`} unit="kg" />
            <Metric label="Hedef" value={`${formatKg(target)}`} unit="kg" />
            <Metric label="Kalan" value={`${formatKg(remaining)}`} unit="kg" />
          </div>

          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
              trendKind === "flat" && "bg-muted text-muted-foreground",
              trendKind !== "flat" && trendIsPositive && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              trendKind !== "flat" && !trendIsPositive && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            )}
          >
            <TrendIcon className="size-3.5" aria-hidden="true" />
            {weekly == null || trendKind === "flat"
              ? "Bu hafta sabit"
              : `Bu hafta ${weekly < 0 ? "−" : "+"}${formatKg(Math.abs(weekly))} kg`}
          </div>
        </div>
      </div>

      {stats.estimatedTargetLabel ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2.5 text-xs">
          <Flag className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Tahmini hedef tarihi:{" "}
            <span className="font-semibold text-foreground">{stats.estimatedTargetLabel}</span>
          </span>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{motivation}</p>
    </section>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">
        {value}
        <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{unit}</span>
      </p>
    </div>
  );
}

function formatKg(n: number): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}

function buildMotivation(p: {
  percent: number;
  remaining: number;
  trendIsPositive: boolean;
  trendKind: "down" | "up" | "flat";
  etaLabel: string | null;
}): string {
  if (p.percent >= 100 || p.remaining <= 0) {
    return "Hedefine ulaştın! 🎉 Şimdi bu dengeyi korumaya odaklanalım.";
  }
  if (p.percent >= 75) {
    return "Son düzlüktesin — hedefine çok az kaldı. Aynı istikrarla devam! 💪";
  }
  if (p.trendKind === "flat") {
    return "Kilon şu an sabit. Küçük bir plato olabilir; öğün ve aktiviteni birlikte gözden geçirebiliriz.";
  }
  if (p.trendIsPositive) {
    return "Doğru yöndesin ve tempo sağlıklı. Bu istikrar hedefe giden en güvenli yol. 👏";
  }
  return "Rota biraz sapmış olabilir; sorun değil. Yarın küçük bir adımla yeniden yola girebiliriz.";
}
