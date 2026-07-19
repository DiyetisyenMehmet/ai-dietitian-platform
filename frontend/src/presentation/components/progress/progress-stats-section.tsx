"use client";

import * as React from "react";
import { CalendarClock, TrendingDown, TrendingUp, Minus } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { SectionCard } from "@/presentation/components/health/section-card";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { useProgressStats } from "@/application/health/progress-analytics";
import { useWeightEntries } from "@/application/health/weight-store";
import { useHealthProfile } from "@/application/health/health-profile-store";

/** Formats a signed kg delta, e.g. -0.6 kg / +0.3 kg / —. */
function deltaLabel(value: number | null): string {
  if (value === null) return "—";
  const rounded = Number(value.toFixed(1));
  if (rounded === 0) return "0,0 kg";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toLocaleString("tr-TR")} kg`;
}

function DeltaStat({ label, value }: { label: string; value: number | null }) {
  const positive = value !== null && value > 0.05;
  const negative = value !== null && value < -0.05;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : Minus;
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-base font-bold tabular-nums">
        <Icon
          className={cn(
            "size-4",
            negative ? "text-emerald-500" : positive ? "text-amber-500" : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
        {deltaLabel(value)}
      </p>
    </div>
  );
}

/** Weekly/monthly analytics with completion %, ETA and an AI interpretation. */
export function ProgressStatsSection() {
  const entries = useWeightEntries();
  const profile = useHealthProfile();
  const stats = useProgressStats(entries, profile.targetWeightKg);

  if (entries.length < 2) return null;

  return (
    <SectionCard icon="activity" title="İlerleme Analizi">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <DeltaStat label="Bu hafta" value={stats.weeklyChangeKg} />
          <DeltaStat label="Bu ay" value={stats.monthlyChangeKg} />
          <DeltaStat label="Hafta ort." value={stats.avgWeeklyChangeKg} />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Hedef tamamlanma</span>
            <span className="font-semibold">%{stats.completionPercent}</span>
          </div>
          <ProgressBar value={stats.completionPercent} />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Hedefe {stats.remainingKg.toLocaleString("tr-TR")} kg kaldı
          </p>
        </div>

        {stats.estimatedTargetLabel && (
          <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarClock className="size-[18px]" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] text-muted-foreground">Tahmini hedef tarihi</p>
              <p className="text-sm font-semibold">{stats.estimatedTargetLabel}</p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-2xl bg-muted/50 p-3">
          <span className="mt-0.5 shrink-0 text-primary">
            {React.createElement(healthIcon("sparkles"), { className: "size-4", "aria-hidden": true })}
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">{stats.interpretation}</p>
        </div>
      </div>
    </SectionCard>
  );
}
