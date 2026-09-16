"use client";

import * as React from "react";
import { Droplets, Footprints, Scale, Utensils, type LucideIcon } from "lucide-react";

import { activityStore, useActivity } from "@/application/health/activity-store";
import {
  dailyTrackingStore,
  useDailyTracking,
} from "@/application/health/daily-tracking-store";
import { healthProfileStore, useHealthProfile } from "@/application/health/health-profile-store";
import {
  nutritionPlanStore,
  useNutritionPlan,
} from "@/application/health/nutrition-plan-store";
import {
  analyzeWeight,
  useWeightEntries,
  weightStore,
} from "@/application/health/weight-store";
import { computeTotals, mealsStore, useMeals } from "@/application/meals/meals-store";
import { onboardingClient } from "@/infrastructure/onboarding/onboarding-client";
import { trackingClient } from "@/infrastructure/tracking/tracking-client";
import { formatNumber, toPercent } from "@/shared/lib/format";

interface MetricRingProps {
  label: string;
  value: string;
  unit?: string;
  percent: number;
  icon: LucideIcon;
  trackClassName: string;
  progressClassName: string;
  iconClassName: string;
}

function MetricRing({
  label,
  value,
  unit,
  percent,
  icon: Icon,
  trackClassName,
  progressClassName,
  iconClassName,
}: MetricRingProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="min-w-0 text-center">
      <div className="relative mx-auto aspect-square w-full max-w-[84px] sm:max-w-[108px]">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle
            cx="50"
            cy="50"
            r="42"
            pathLength="100"
            fill="none"
            strokeWidth="9"
            className={trackClassName}
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            pathLength="100"
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${clamped} ${100 - clamped}`}
            className={`${progressClassName} transition-[stroke-dasharray] duration-700 ease-out`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-1">
          <Icon className={`mb-0.5 size-4 sm:size-5 ${iconClassName}`} aria-hidden="true" />
          <span className="max-w-full truncate text-[13px] font-bold leading-none tabular-nums sm:text-lg">
            {value}
          </span>
          {unit && (
            <span className="mt-0.5 text-[9px] font-medium leading-none text-muted-foreground sm:text-[11px]">
              {unit}
            </span>
          )}
        </div>
      </div>
      <p className="mt-1.5 truncate text-[11px] font-semibold text-foreground sm:text-sm">{label}</p>
    </div>
  );
}

/** Compact, real-data summary matching the approved four-ring home layout. */
export function DashboardMetricsSection() {
  const profile = useHealthProfile();
  const { waterMl, waterGoalMl } = useDailyTracking();
  const meals = useMeals();
  const activity = useActivity();
  const entries = useWeightEntries();
  const { activePlan } = useNutritionPlan();

  React.useEffect(() => {
    void Promise.allSettled([
      onboardingClient.getProfile().then(({ profile: backendProfile }) => {
        if (!backendProfile) return;
        healthProfileStore.update({
          currentWeightKg: backendProfile.currentWeightKg,
          targetWeightKg: backendProfile.targetWeightKg,
        });
      }),
      dailyTrackingStore.hydrateWaterFromBackend(),
      mealsStore.hydrateMealsFromBackend(),
      activityStore.hydrateFromBackend(),
      weightStore.hydrateWeightFromBackend(),
      nutritionPlanStore.hydrateFromBackend(),
      trackingClient.getWaterGoal().then((goal) => {
        dailyTrackingStore.setWaterGoal(goal.dailyWaterGoalMl);
      }),
    ]);
  }, []);

  React.useEffect(() => {
    if (waterGoalMl <= 0 && profile.dailyWaterGoalMl > 0) {
      dailyTrackingStore.setWaterGoal(profile.dailyWaterGoalMl);
    }
  }, [profile.dailyWaterGoalMl, waterGoalMl]);

  const totals = React.useMemo(() => computeTotals(meals), [meals]);
  const calories = Math.round(totals.calories);
  const calorieGoal = activePlan?.dailyCalories ?? profile.dailyCalorieGoal;
  const waterGoal = waterGoalMl > 0 ? waterGoalMl : profile.dailyWaterGoalMl;
  const waterPercent = waterGoal > 0 ? toPercent(waterMl, waterGoal) : 0;
  const caloriePercent = calorieGoal > 0 ? toPercent(calories, calorieGoal) : 0;

  const showSteps = activity.steps > 0;
  const movementValue = showSteps ? activity.steps : activity.activeMinutes;
  const movementGoal = showSteps ? activity.stepGoal : activity.activeMinutesGoal;
  const movementPercent = movementGoal > 0 ? toPercent(movementValue, movementGoal) : 0;
  const movementUnit = showSteps ? "adım" : "dk";

  const latestWeight = profile.currentWeightKg > 0 ? profile.currentWeightKg : (entries.at(-1)?.weightKg ?? 0);
  const weightAnalysis = React.useMemo(
    () => analyzeWeight(entries, profile.targetWeightKg),
    [entries, profile.targetWeightKg],
  );
  const weightPercent = weightAnalysis.status === "no-data" ? 0 : weightAnalysis.progressPercent;

  return (
    <section aria-label="Bugünkü özet" className="rounded-3xl border border-border/70 bg-card/70 px-3 py-4 shadow-sm sm:px-5">
      <div className="grid grid-cols-4 gap-2 sm:gap-4">
        <MetricRing
          label="Su"
          value={`%${Math.min(100, Math.round(waterPercent))}`}
          percent={waterPercent}
          icon={Droplets}
          trackClassName="stroke-sky-500/15"
          progressClassName="stroke-sky-500"
          iconClassName="text-sky-500"
        />
        <MetricRing
          label="Beslenme"
          value={formatNumber(calories)}
          unit="kcal"
          percent={caloriePercent}
          icon={Utensils}
          trackClassName="stroke-emerald-500/15"
          progressClassName="stroke-emerald-500"
          iconClassName="text-emerald-500"
        />
        <MetricRing
          label="Hareket"
          value={formatNumber(movementValue)}
          unit={movementUnit}
          percent={movementPercent}
          icon={Footprints}
          trackClassName="stroke-teal-500/15"
          progressClassName="stroke-teal-500"
          iconClassName="text-teal-500"
        />
        <MetricRing
          label="Kilo"
          value={latestWeight > 0 ? latestWeight.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) : "—"}
          unit="kg"
          percent={weightPercent}
          icon={Scale}
          trackClassName="stroke-violet-500/15"
          progressClassName="stroke-violet-500"
          iconClassName="text-violet-500"
        />
      </div>
    </section>
  );
}
