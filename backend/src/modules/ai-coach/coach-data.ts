import type {
  BloodTestAnalysis,
  MealLog,
  NutritionPlan,
  UserProfile,
  WaterLog,
  WeightLog,
} from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { bloodTestAnalysisRepository } from "../blood-test-analysis/blood-test-analysis.repository";
import { trackingRepository } from "../tracking/tracking.repository";
import { average, daysAgo, groupBy, turkeyDayKey } from "./metrics";

/**
 * A bundle of the signals the AI Health Coach reasons over for one user, loaded
 * once and shared across the memory, risk, review and adaptation services to
 * avoid redundant queries. `windowDays` bounds the time-series pulls (premium =
 * 90 days, free = 14).
 */
export interface CoachDataBundle {
  windowDays: number;
  profile: UserProfile | null;
  activePlan: NutritionPlan | null;
  weightLogs: WeightLog[];
  mealLogs: MealLog[];
  waterLogs: WaterLog[];
  latestAnalysis: BloodTestAnalysis | null;
  lastAnalysisAt: Date | null;
}

/** Loads the coach data bundle for a user over the given window. */
export async function loadCoachData(userId: string, windowDays: number): Promise<CoachDataBundle> {
  const since = daysAgo(windowDays);
  const [profile, activePlan, weightLogs, mealLogs, waterLogs, analyses] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.nutritionPlan.findFirst({
      where: { userId, isActive: true },
      orderBy: { updatedAt: "desc" },
    }),
    trackingRepository.listWeightLogs(userId, since),
    trackingRepository.listMealLogs(userId, since),
    trackingRepository.listWaterLogs(userId, since),
    bloodTestAnalysisRepository.listByUser(userId),
  ]);

  const completed = analyses.filter((a) => a.status === "COMPLETED");
  const latestAnalysis = completed[0] ?? null;
  const lastAnalysisAt = latestAnalysis?.createdAt ?? null;

  return {
    windowDays,
    profile,
    activePlan,
    weightLogs,
    mealLogs,
    waterLogs,
    latestAnalysis,
    lastAnalysisAt,
  };
}

/** Weight-trend direction over the window. */
export type TrendDirection = "IMPROVING" | "STABLE" | "DECLINING";

/** Derived weight statistics from the log window (newest-first input). */
export interface WeightDerived {
  latestKg: number | null;
  earliestKg: number | null;
  deltaKg: number | null;
  weekOverWeekKg: number | null;
  trend: TrendDirection;
}

/**
 * Derives weight trend from logs. "IMPROVING"/"DECLINING" are interpreted
 * relative to the user's goal direction (losing vs. gaining), so the coach's
 * language matches the user's objective rather than raw sign of change.
 */
export function deriveWeight(weightLogs: WeightLog[], profile: UserProfile | null): WeightDerived {
  if (weightLogs.length === 0) {
    return {
      latestKg: null,
      earliestKg: null,
      deltaKg: null,
      weekOverWeekKg: null,
      trend: "STABLE",
    };
  }
  // Logs arrive newest-first.
  const latest = weightLogs[0];
  const earliest = weightLogs[weightLogs.length - 1];
  const latestKg = latest.weightKg;
  const earliestKg = earliest.weightKg;
  const deltaKg = latestKg - earliestKg;

  // Week-over-week: compare the most recent 7 days' average to the prior 7.
  const now = latest.loggedAt;
  const lastWeek = weightLogs.filter((w) => w.loggedAt >= daysAgo(7, now));
  const priorWeek = weightLogs.filter(
    (w) => w.loggedAt < daysAgo(7, now) && w.loggedAt >= daysAgo(14, now),
  );
  const weekOverWeekKg =
    lastWeek.length > 0 && priorWeek.length > 0
      ? average(lastWeek.map((w) => w.weightKg)) - average(priorWeek.map((w) => w.weightKg))
      : null;

  const wantsToLose = profile ? profile.targetWeightKg < profile.currentWeightKg : true;
  const change = weekOverWeekKg ?? deltaKg;
  let trend: TrendDirection = "STABLE";
  if (Math.abs(change) >= 0.3) {
    const movingToward = wantsToLose ? change < 0 : change > 0;
    trend = movingToward ? "IMPROVING" : "DECLINING";
  }

  return { latestKg, earliestKg, deltaKg, weekOverWeekKg, trend };
}

/** Distinct Turkey-local days that had at least `minMeals` meals logged. */
export function daysWithMeals(mealLogs: MealLog[], minMeals: number): number {
  const byDay = groupBy(mealLogs, (m) => turkeyDayKey(m.loggedAt));
  let count = 0;
  for (const meals of byDay.values()) {
    if (meals.length >= minMeals) count += 1;
  }
  return count;
}

/** Fraction (0-1) of the last `days` calendar days on which a meal was logged. */
export function mealDayCoverage(mealLogs: MealLog[], days: number): number {
  if (days <= 0) return 0;
  const byDay = groupBy(mealLogs, (m) => turkeyDayKey(m.loggedAt));
  return Math.min(1, byDay.size / days);
}
