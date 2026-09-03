import type {
  Activity,
  BloodTestAnalysis,
  MealLog,
  NutritionPlan,
  UserProfile,
  WaterLog,
  WeightLog,
} from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { activityRepository } from "../activity/activity.repository";
import { bloodTestAnalysisRepository } from "../blood-test-analysis/blood-test-analysis.repository";
import { trackingRepository } from "../tracking/tracking.repository";
import { average, daysAgo, groupByDay } from "./metrics";

/** Optional health signals threaded through the coach without schema coupling. */
export interface CoachHealthSignals {
  /** Real persisted physical-activity logs over the same bounded window. */
  activities?: Activity[];
  [signal: string]: unknown;
}

/**
 * Bundle of signals the AI Health Coach reasons over for one user. `windowDays`
 * bounds time-series pulls (premium = 90 days, free = 14).
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
  healthSignals?: CoachHealthSignals;
}

/** Loads the coach data bundle for a user over the given window. */
export async function loadCoachData(userId: string, windowDays: number): Promise<CoachDataBundle> {
  const since = daysAgo(windowDays);
  const [profile, activePlan, weightLogs, mealLogs, waterLogs, analyses, activities] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }).catch(() => null),
    prisma.nutritionPlan
      .findFirst({
        where: { userId, isActive: true },
        orderBy: { updatedAt: "desc" },
      })
      .catch(() => null),
    trackingRepository.listWeightLogs(userId, since).catch(() => []),
    trackingRepository.listMealLogs(userId, since).catch(() => []),
    trackingRepository.listWaterLogs(userId, since).catch(() => []),
    bloodTestAnalysisRepository.listByUser(userId).catch(() => []),
    activityRepository.listActivities(userId, since).catch(() => []),
  ]);

  const completed = (analyses ?? []).filter((a) => a.status === "COMPLETED");
  const latestAnalysis = completed[0] ?? null;
  const lastAnalysisAt = latestAnalysis?.createdAt ?? null;

  return {
    windowDays,
    profile,
    activePlan,
    weightLogs: weightLogs ?? [],
    mealLogs: mealLogs ?? [],
    waterLogs: waterLogs ?? [],
    latestAnalysis,
    lastAnalysisAt,
    healthSignals: { activities: activities ?? [] },
  };
}

/** Weight-trend direction over the window. */
export type TrendDirection = "IMPROVING" | "STABLE" | "DECLINING";

/** Derived weight statistics from newest-first input. */
export interface WeightDerived {
  latestKg: number | null;
  earliestKg: number | null;
  deltaKg: number | null;
  weekOverWeekKg: number | null;
  trend: TrendDirection;
}

/**
 * Derives weight trend relative to the user's goal direction (losing/gaining),
 * not merely the raw sign of the change.
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

  const latest = weightLogs[0];
  const earliest = weightLogs[weightLogs.length - 1];
  const latestKg = latest.weightKg;
  const earliestKg = earliest.weightKg;
  const deltaKg = latestKg - earliestKg;

  const now = latest.loggedAt;
  const lastWeek = weightLogs.filter((w) => w.loggedAt >= daysAgo(7, now));
  const priorWeek = weightLogs.filter(
    (w) => w.loggedAt < daysAgo(7, now) && w.loggedAt >= daysAgo(14, now),
  );
  const weekOverWeekKg =
    lastWeek.length > 0 && priorWeek.length > 0
      ? average(lastWeek.map((w) => w.weightKg)) - average(priorWeek.map((w) => w.weightKg))
      : null;

  const wantsToLose =
    profile && profile.targetWeightKg != null && profile.currentWeightKg != null
      ? profile.targetWeightKg < profile.currentWeightKg
      : true;
  const change = weekOverWeekKg ?? deltaKg;
  let trend: TrendDirection = "STABLE";
  if (change != null && Math.abs(change) >= 0.3) {
    const movingToward = wantsToLose ? change < 0 : change > 0;
    trend = movingToward ? "IMPROVING" : "DECLINING";
  }

  return { latestKg, earliestKg, deltaKg, weekOverWeekKg, trend };
}

/**
 * Distinct Turkey-local days that had at least `minMeals` meal TYPES logged.
 * Counting raw MealLog rows is incorrect because one breakfast can contain
 * several food rows (and now an explicit check-in row) while still being one
 * meal. Distinct types keeps consistency metrics truthful.
 */
export function daysWithMeals(mealLogs: MealLog[], minMeals: number): number {
  const byDay = groupByDay(mealLogs);
  let count = 0;
  for (const meals of byDay.values()) {
    const distinctMealTypes = new Set(meals.map((meal) => meal.mealType)).size;
    if (distinctMealTypes >= minMeals) count += 1;
  }
  return count;
}

/** Fraction (0-1) of the last `days` calendar days on which a meal was logged. */
export function mealDayCoverage(mealLogs: MealLog[], days: number): number {
  if (days <= 0) return 0;
  const byDay = groupByDay(mealLogs);
  return Math.min(1, byDay.size / days);
}
