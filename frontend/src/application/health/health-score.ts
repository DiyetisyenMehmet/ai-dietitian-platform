"use client";

import * as React from "react";

import type { HealthScore, HealthScoreFactor, ScoreTrend } from "@/domain/health/types";
import { useMeals } from "@/application/meals/meals-store";
import { useDailyTracking } from "./daily-tracking-store";
import { useActivity } from "./activity-store";
import { useWeightEntries } from "./weight-store";
import { useBloodTests } from "./blood-test-store";

/**
 * The dynamic Health Score (0–100) — a single, honest number that answers
 * "how am I doing overall?". It is a weighted blend of six coaching signals:
 * meal consistency, weight tracking, hydration, AI interaction, activity and
 * blood-test recency. Pure computation over the session stores so it can be
 * reused without React and later backed by the Sprint 19 tracking API.
 *
 * This is coaching guidance, never a medical assessment.
 */

const WEIGHTS = {
  meals: 0.25,
  water: 0.2,
  activity: 0.2,
  weight: 0.15,
  coach: 0.1,
  bloodTest: 0.1,
} as const;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function bandFor(score: number): string {
  if (score >= 85) return "Mükemmel";
  if (score >= 70) return "Çok iyi";
  if (score >= 55) return "İyi";
  if (score >= 40) return "Gelişmekte";
  return "Başlangıç";
}

export interface HealthScoreInputs {
  loggedMealSlots: number;
  waterRatio: number;
  activityRatio: number;
  daysSinceWeighIn: number | null;
  chattedToday: boolean;
  daysSinceBloodTest: number | null;
}

/** Pure health-score computation from normalized coaching signals. */
export function computeHealthScore(inputs: HealthScoreInputs): HealthScore {
  const mealsValue = clamp01(inputs.loggedMealSlots / 3) * 100;
  const waterValue = clamp01(inputs.waterRatio) * 100;
  const activityValue = clamp01(inputs.activityRatio) * 100;
  const weightValue =
    inputs.daysSinceWeighIn === null
      ? 0
      : clamp01(1 - inputs.daysSinceWeighIn / 7) * 100;
  const coachValue = inputs.chattedToday ? 100 : 40;
  const bloodValue =
    inputs.daysSinceBloodTest === null
      ? 0
      : clamp01(1 - inputs.daysSinceBloodTest / 90) * 100;

  const factors: HealthScoreFactor[] = [
    { key: "meals", label: "Öğün tutarlılığı", value: Math.round(mealsValue), weight: WEIGHTS.meals, icon: "utensils" },
    { key: "water", label: "Su takibi", value: Math.round(waterValue), weight: WEIGHTS.water, icon: "droplet" },
    { key: "activity", label: "Hareket", value: Math.round(activityValue), weight: WEIGHTS.activity, icon: "footprints" },
    { key: "weight", label: "Kilo takibi", value: Math.round(weightValue), weight: WEIGHTS.weight, icon: "scale" },
    { key: "coach", label: "Koç etkileşimi", value: Math.round(coachValue), weight: WEIGHTS.coach, icon: "message" },
    { key: "bloodTest", label: "Kan tahlili", value: Math.round(bloodValue), weight: WEIGHTS.bloodTest, icon: "flask" },
  ];

  const score = Math.round(
    factors.reduce((sum, f) => sum + f.value * f.weight, 0),
  );

  // A transparent baseline: the score the user would have from their standing
  // habits alone (weight + blood-test recency), so the delta reflects how much
  // today's actions have lifted the score. Honest and deterministic.
  const baseline = Math.round(weightValue * 0.4 + bloodValue * 0.25 + 40 * 0.35);
  const delta = score - baseline;
  const trend: ScoreTrend = delta > 3 ? "up" : delta < -3 ? "down" : "flat";

  // Build the reason from the two strongest and the two weakest factors.
  const ranked = [...factors].sort((a, b) => b.value - a.value);
  const strong = ranked[0];
  const weak = ranked[ranked.length - 1];
  const reason =
    score >= 70
      ? `Puanını en çok "${strong.label.toLocaleLowerCase("tr-TR")}" yükseltiyor. "${weak.label.toLocaleLowerCase("tr-TR")}" alanına biraz daha özen gösterirsen zirveye çok yakınsın.`
      : `Bugün en zayıf alanın "${weak.label.toLocaleLowerCase("tr-TR")}". Birkaç küçük adımla puanını hızla yükseltebiliriz.`;

  // Actionable improvements from the weakest factors below 70.
  const HINTS: Record<string, { label: string; href?: string }> = {
    meals: { label: "Öğünlerini kaydet", href: "/meals/add" },
    water: { label: "Su ekle", href: "/dashboard" },
    activity: { label: "Hareketini kaydet", href: "/dashboard" },
    weight: { label: "Kilonu kaydet", href: "/progress" },
    coach: { label: "Koçunla konuş", href: "/ai" },
    bloodTest: { label: "Kan tahlili yükle", href: "/profile/blood-tests" },
  };
  const improvements = ranked
    .filter((f) => f.value < 70)
    .slice(-3)
    .reverse()
    .map((f) => HINTS[f.key])
    .filter(Boolean);

  return {
    score,
    band: bandFor(score),
    trend,
    delta,
    reason,
    improvements,
    factors,
  };
}

/** Reactive hook computing the live health score from the session stores. */
export function useHealthScore(): HealthScore {
  const meals = useMeals();
  const { waterMl, waterGoalMl, chattedToday } = useDailyTracking();
  const activity = useActivity();
  const weightEntries = useWeightEntries();
  const bloodTests = useBloodTests();

  return React.useMemo(() => {
    const loggedMealSlots = ["breakfast", "lunch", "dinner"].filter(
      (slot) => (meals.find((m) => m.slot === slot)?.foods.length ?? 0) > 0,
    ).length;

    const latestWeigh = weightEntries.at(-1);
    const daysSinceWeighIn = latestWeigh
      ? Math.round((Date.now() - new Date(latestWeigh.date).getTime()) / 86_400_000)
      : null;

    const latestBlood = [...bloodTests].sort((a, b) => b.date.localeCompare(a.date))[0];
    const daysSinceBloodTest = latestBlood
      ? Math.round((Date.now() - new Date(latestBlood.date).getTime()) / 86_400_000)
      : null;

    const waterRatio = waterGoalMl > 0 ? waterMl / waterGoalMl : 0;
    const activityRatio =
      activity.stepGoal > 0 ? activity.steps / activity.stepGoal : 0;

    return computeHealthScore({
      loggedMealSlots,
      waterRatio,
      activityRatio,
      daysSinceWeighIn,
      chattedToday,
      daysSinceBloodTest,
    });
  }, [meals, waterMl, waterGoalMl, chattedToday, activity, weightEntries, bloodTests]);
}
