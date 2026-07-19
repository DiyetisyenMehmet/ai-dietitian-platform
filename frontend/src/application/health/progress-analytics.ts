"use client";

import * as React from "react";

import type { WeightEntry } from "@/domain/health/types";
import { analyzeWeight, type WeightDirection } from "./weight-store";

/**
 * Deeper progress analytics for the Progress screen: weekly & monthly deltas,
 * average weekly change, an estimated target date, goal-completion percentage
 * and a plain-language AI interpretation. Pure functions over the weight
 * history so they can be unit-tested and reused without React.
 */

export interface ProgressStats {
  direction: WeightDirection;
  /** Signed change over the last ~7 days (kg). Negative = lost. */
  weeklyChangeKg: number | null;
  /** Signed change over the last ~30 days (kg). */
  monthlyChangeKg: number | null;
  /** Average signed change per week across the whole history (kg). */
  avgWeeklyChangeKg: number | null;
  /** 0..100 completion toward the target. */
  completionPercent: number;
  /** Remaining kg to the target (absolute). */
  remainingKg: number;
  /** Estimated ISO date the target is reached, or null if not projectable. */
  estimatedTargetDate: string | null;
  /** Human-readable ETA label (Turkish), or null. */
  estimatedTargetLabel: string | null;
  /** Plain-language interpretation of the trend (Turkish). */
  interpretation: string;
}

function sorted(list: WeightEntry[]): WeightEntry[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

/** Change between the latest entry and the last entry on/before `daysAgo`. */
function changeOverDays(list: WeightEntry[], daysAgo: number): number | null {
  if (list.length < 2) return null;
  const latest = list[list.length - 1];
  const cutoff = new Date(latest.date);
  cutoff.setDate(cutoff.getDate() - daysAgo);
  // Find the entry closest to (but not after) the cutoff; fall back to the first.
  let baseline = list[0];
  for (const e of list) {
    if (new Date(e.date) <= cutoff) baseline = e;
    else break;
  }
  if (baseline.id === latest.id) return null;
  return Number((latest.weightKg - baseline.weightKg).toFixed(1));
}

export function analyzeProgressStats(entries: WeightEntry[], targetKg: number): ProgressStats {
  const list = sorted(entries);
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
  const totalDays = Math.max(
    1,
    Math.round((new Date(latest.date).getTime() - new Date(first.date).getTime()) / 86_400_000),
  );
  const totalChange = latest.weightKg - first.weightKg;
  const avgWeeklyChangeKg = Number(((totalChange / totalDays) * 7).toFixed(2));

  const weeklyChangeKg = changeOverDays(list, 7);
  const monthlyChangeKg = changeOverDays(list, 30);

  const remainingKg = Number(Math.abs(targetKg - latest.weightKg).toFixed(1));

  // Project the target date from the average weekly pace, but only when the
  // pace is meaningfully moving toward the goal.
  const movingTowardGoal =
    (base.direction === "lose" && avgWeeklyChangeKg < -0.05) ||
    (base.direction === "gain" && avgWeeklyChangeKg > 0.05);

  let estimatedTargetDate: string | null = null;
  let estimatedTargetLabel: string | null = null;
  if (base.status === "reached") {
    estimatedTargetLabel = "Hedefe ulaşıldı 🎉";
  } else if (movingTowardGoal && remainingKg > 0) {
    const weeksNeeded = remainingKg / Math.abs(avgWeeklyChangeKg);
    const daysNeeded = Math.round(weeksNeeded * 7);
    const eta = new Date(latest.date);
    eta.setDate(eta.getDate() + daysNeeded);
    estimatedTargetDate = eta.toISOString().slice(0, 10);
    estimatedTargetLabel = eta.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
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
  avgWeeklyChangeKg: number;
  weeklyChangeKg: number | null;
  remainingKg: number;
  reached: boolean;
  estimatedTargetLabel: string | null;
}): string {
  if (p.reached) {
    return "Hedefine ulaştın! 🎉 Artık odak, bu dengeyi korumakta. Kilonu haftada bir kontrol etmen yeterli.";
  }
  const absWeekly = Math.abs(p.avgWeeklyChangeKg);
  const parts: string[] = [];

  if (absWeekly < 0.05) {
    parts.push(
      "Kilon son dönemde oldukça sabit seyrediyor. Bu bir plato olabilir; öğün dağılımını ya da aktiviteni birlikte gözden geçirebiliriz.",
    );
  } else {
    const paceWord = absWeekly >= 0.7 ? "hızlı" : absWeekly >= 0.25 ? "sağlıklı ve dengeli" : "yavaş ama istikrarlı";
    const dirWord = p.avgWeeklyChangeKg < 0 ? "veriyorsun" : "alıyorsun";
    parts.push(
      `Ortalama haftada ${absWeekly.toLocaleString("tr-TR")} kg ${dirWord} — ${paceWord} bir tempo.`,
    );
  }

  if (p.estimatedTargetLabel) {
    parts.push(`Bu tempoyu korursan hedefine tahmini ${p.estimatedTargetLabel} tarihinde ulaşırsın.`);
  } else if (absWeekly >= 0.05) {
    parts.push(`Hedefe ${p.remainingKg.toLocaleString("tr-TR")} kg kaldı.`);
  }

  parts.push("Bunlar tıbbi teşhis değil; verilerine dayalı güvenli bir rehberliktir.");
  return parts.join(" ");
}

/** Reactive hook wrapping {@link analyzeProgressStats}. */
export function useProgressStats(entries: WeightEntry[], targetKg: number): ProgressStats {
  return React.useMemo(() => analyzeProgressStats(entries, targetKg), [entries, targetKg]);
}
