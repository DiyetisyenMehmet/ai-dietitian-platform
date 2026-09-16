"use client";

import * as React from "react";

import type { WeightEntry } from "@/domain/health/types";
import { analyzeWeight, type WeightDirection } from "./weight-store";
import {
  calendarDaySpan,
  dateKeyToLocalNoon,
  localDateKey,
  sortWeightEntries,
} from "./weight-utils";

export interface ProgressStats {
  direction: WeightDirection;
  weeklyChangeKg: number | null;
  monthlyChangeKg: number | null;
  avgWeeklyChangeKg: number | null;
  completionPercent: number;
  remainingKg: number;
  estimatedTargetDate: string | null;
  estimatedTargetLabel: string | null;
  interpretation: string;
}

/** Change between the latest entry and the last entry on/before `daysAgo`. */
function changeOverDays(list: WeightEntry[], daysAgo: number): number | null {
  if (list.length < 2) return null;
  const latest = list[list.length - 1];
  if (calendarDaySpan(list[0], latest) < 1) return null;

  const latestDate = dateKeyToLocalNoon(latest.date);
  if (!latestDate) return null;
  const cutoff = new Date(latestDate);
  cutoff.setDate(cutoff.getDate() - daysAgo);
  const cutoffKey = localDateKey(cutoff);

  let baseline: WeightEntry | null = null;
  for (const entry of list) {
    if (entry.date <= cutoffKey) baseline = entry;
    else break;
  }

  // With less than the requested window of history, use the earliest different
  // calendar day rather than pretending two same-day measurements form a trend.
  baseline ??= list.find((entry) => entry.date !== latest.date) ?? null;
  if (!baseline || baseline.id === latest.id) return null;
  return Number((latest.weightKg - baseline.weightKg).toFixed(1));
}

export function analyzeProgressStats(entries: WeightEntry[], targetKg: number): ProgressStats {
  const list = sortWeightEntries(entries);
  const base = analyzeWeight(list, targetKg);

  if (list.length < 2 || base.startKg === null || base.latestKg === null) {
    return {
      direction: base.direction,
      weeklyChangeKg: null,
      monthlyChangeKg: null,
      avgWeeklyChangeKg: null,
      completionPercent: base.progressPercent,
      remainingKg: Number(Math.abs(targetKg - (base.latestKg ?? targetKg)).toFixed(1)),
      estimatedTargetDate: null,
      estimatedTargetLabel: null,
      interpretation:
        "İlerlemeni yorumlayabilmem için birkaç kilo kaydına daha ihtiyacım var. Düzenli tartıldıkça tahminlerim netleşecek.",
    };
  }

  const first = list[0];
  const latest = list[list.length - 1];
  const totalDays = calendarDaySpan(first, latest);
  const totalChange = latest.weightKg - first.weightKg;
  const avgWeeklyChangeKg =
    totalDays >= 1 ? Number(((totalChange / totalDays) * 7).toFixed(2)) : null;

  const weeklyChangeKg = changeOverDays(list, 7);
  const monthlyChangeKg = changeOverDays(list, 30);
  const remainingKg = Number(Math.abs(targetKg - latest.weightKg).toFixed(1));

  const movingTowardGoal =
    avgWeeklyChangeKg !== null &&
    ((base.direction === "lose" && avgWeeklyChangeKg < -0.05) ||
      (base.direction === "gain" && avgWeeklyChangeKg > 0.05));

  let estimatedTargetDate: string | null = null;
  let estimatedTargetLabel: string | null = null;
  if (base.status === "reached") {
    estimatedTargetLabel = "Hedefe ulaşıldı 🎉";
  } else if (movingTowardGoal && avgWeeklyChangeKg !== null && remainingKg > 0) {
    const weeksNeeded = remainingKg / Math.abs(avgWeeklyChangeKg);
    const daysNeeded = Math.round(weeksNeeded * 7);
    const eta = dateKeyToLocalNoon(latest.date);
    if (eta && Number.isFinite(daysNeeded) && daysNeeded >= 0) {
      eta.setDate(eta.getDate() + daysNeeded);
      estimatedTargetDate = localDateKey(eta);
      estimatedTargetLabel = eta.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
  }

  const interpretation = buildInterpretation({
    direction: base.direction,
    avgWeeklyChangeKg,
    weeklyChangeKg,
    remainingKg,
    reached: base.status === "reached",
    estimatedTargetLabel,
  });

  return {
    direction: base.direction,
    weeklyChangeKg,
    monthlyChangeKg,
    avgWeeklyChangeKg,
    completionPercent: base.progressPercent,
    remainingKg,
    estimatedTargetDate,
    estimatedTargetLabel,
    interpretation,
  };
}

function buildInterpretation(p: {
  direction: WeightDirection;
  avgWeeklyChangeKg: number | null;
  weeklyChangeKg: number | null;
  remainingKg: number;
  reached: boolean;
  estimatedTargetLabel: string | null;
}): string {
  if (p.reached) {
    return "Hedefine ulaştın! 🎉 Artık odak, bu dengeyi korumakta. Kilonu haftada bir kontrol etmen yeterli.";
  }
  if (p.avgWeeklyChangeKg === null) {
    return "Farklı günlerde yeterli ölçüm oluştuğunda haftalık değişim ve hedef tahmini burada gösterilecek. Bunlar tıbbi teşhis değil; verilerine dayalı rehberliktir.";
  }

  const absWeekly = Math.abs(p.avgWeeklyChangeKg);
  const parts: string[] = [];

  if (absWeekly < 0.05) {
    parts.push(
      "Kilon son dönemde oldukça sabit seyrediyor. Daha uzun süreli kayıt oluştuğunda eğilim daha anlamlı hale gelecek.",
    );
  } else {
    const paceWord =
      absWeekly >= 0.7 ? "hızlı" : absWeekly >= 0.25 ? "dengeli" : "yavaş ama istikrarlı";
    const dirWord = p.avgWeeklyChangeKg < 0 ? "veriyorsun" : "alıyorsun";
    parts.push(
      `Ortalama haftada ${absWeekly.toLocaleString("tr-TR")} kg ${dirWord} — ${paceWord} bir tempo.`,
    );
  }

  if (p.estimatedTargetLabel) {
    parts.push(`Bu tempo sürerse tahmini hedef tarihi ${p.estimatedTargetLabel}.`);
  } else if (absWeekly >= 0.05) {
    parts.push(`Hedefe ${p.remainingKg.toLocaleString("tr-TR")} kg kaldı.`);
  }

  parts.push("Bunlar tıbbi teşhis değil; verilerine dayalı rehberliktir.");
  return parts.join(" ");
}

export function useProgressStats(entries: WeightEntry[], targetKg: number): ProgressStats {
  return React.useMemo(() => analyzeProgressStats(entries, targetKg), [entries, targetKg]);
}
