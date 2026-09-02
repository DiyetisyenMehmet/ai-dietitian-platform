"use client";

import * as React from "react";

import type { HealthScore, HealthScoreFactor } from "@/domain/health/types";
import { useMeals } from "@/application/meals/meals-store";
import { useDailyTracking } from "./daily-tracking-store";
import { useActivity } from "./activity-store";

/**
 * Deterministic Daily Adherence Score (0–100).
 *
 * This is deliberately NOT a medical/health assessment. It measures only how
 * closely today's persisted tracking data follows configured daily targets.
 * Unavailable/unconfigured signals are excluded and remaining weights are
 * re-normalized, so a user is never penalized for not having a blood test,
 * wearable, AI chat or other optional feature.
 */

const BASE_WEIGHTS = {
  meals: 0.45,
  water: 0.35,
  activity: 0.2,
} as const;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function bandFor(score: number): string {
  if (score >= 85) return "Çok iyi";
  if (score >= 70) return "İyi";
  if (score >= 50) return "Gelişiyor";
  if (score >= 25) return "Başlangıç";
  return "Bugün yeni başlıyor";
}

export interface HealthScoreInputs {
  loggedMealSlots: number;
  waterRatio: number | null;
  activityRatio: number | null;
  // Retained as optional compatibility fields for callers/tests from earlier
  // iterations. They no longer affect this daily adherence metric.
  daysSinceWeighIn?: number | null;
  chattedToday?: boolean;
  daysSinceBloodTest?: number | null;
}

interface CandidateFactor {
  key: string;
  label: string;
  value: number;
  baseWeight: number;
  icon: HealthScoreFactor["icon"];
  improvement: { label: string; href?: string };
}

/** Pure adherence-score computation from normalized, available daily signals. */
export function computeHealthScore(inputs: HealthScoreInputs): HealthScore {
  const candidates: CandidateFactor[] = [
    {
      key: "meals",
      label: "Öğün kaydı",
      value: Math.round(clamp01(inputs.loggedMealSlots / 3) * 100),
      baseWeight: BASE_WEIGHTS.meals,
      icon: "utensils",
      improvement: { label: "Öğününü kaydet", href: "/meals/add" },
    },
  ];

  if (inputs.waterRatio !== null) {
    candidates.push({
      key: "water",
      label: "Su hedefi",
      value: Math.round(clamp01(inputs.waterRatio) * 100),
      baseWeight: BASE_WEIGHTS.water,
      icon: "droplet",
      improvement: { label: "Su ekle", href: "/dashboard" },
    });
  }

  if (inputs.activityRatio !== null) {
    candidates.push({
      key: "activity",
      label: "Aktivite hedefi",
      value: Math.round(clamp01(inputs.activityRatio) * 100),
      baseWeight: BASE_WEIGHTS.activity,
      icon: "activity",
      improvement: { label: "Aktivite kaydet", href: "/dashboard" },
    });
  }

  const availableWeight = candidates.reduce((sum, factor) => sum + factor.baseWeight, 0);
  const factors: HealthScoreFactor[] = candidates.map((factor) => ({
    key: factor.key,
    label: factor.label,
    value: factor.value,
    weight: availableWeight > 0 ? factor.baseWeight / availableWeight : 0,
    icon: factor.icon,
  }));

  const score = Math.round(factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0));
  const ranked = [...factors].sort((a, b) => b.value - a.value);
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];

  const reason =
    score >= 70
      ? `Bugünkü kayıtlarına göre en güçlü alanın ${strongest.label.toLocaleLowerCase("tr-TR")}. Bu skor yalnızca günlük takip uyumunu gösterir.`
      : `Bugünkü kayıtlarına göre en kolay geliştirebileceğin alan ${weakest.label.toLocaleLowerCase("tr-TR")}. Bu skor tıbbi bir değerlendirme değildir.`;

  const improvements = ranked
    .filter((factor) => factor.value < 70)
    .slice(0, 2)
    .map((factor) => candidates.find((candidate) => candidate.key === factor.key)?.improvement)
    .filter((item): item is { label: string; href?: string } => Boolean(item));

  return {
    score,
    band: bandFor(score),
    // A real trend requires persisted historical score snapshots. Do not invent
    // one from an arbitrary baseline; keep it neutral until that source exists.
    trend: "flat",
    delta: 0,
    reason,
    improvements,
    factors,
  };
}

/** Reactive hook computing today's adherence from persisted session caches. */
export function useHealthScore(): HealthScore {
  const meals = useMeals();
  const { waterMl, waterGoalMl } = useDailyTracking();
  const activity = useActivity();

  return React.useMemo(() => {
    const loggedMealSlots = ["breakfast", "lunch", "dinner"].filter(
      (slot) => (meals.find((meal) => meal.slot === slot)?.foods.length ?? 0) > 0,
    ).length;

    const waterRatio = waterGoalMl > 0 ? waterMl / waterGoalMl : null;
    const activityRatio =
      activity.activeMinutesGoal > 0
        ? activity.activeMinutes / activity.activeMinutesGoal
        : null;

    return computeHealthScore({ loggedMealSlots, waterRatio, activityRatio });
  }, [meals, waterMl, waterGoalMl, activity.activeMinutes, activity.activeMinutesGoal]);
}
