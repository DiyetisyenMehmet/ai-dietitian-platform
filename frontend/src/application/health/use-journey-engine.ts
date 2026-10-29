"use client";

import * as React from "react";
import { mealsStore, useMeals, useMealsReadiness } from "../meals/meals-store";
import { dailyTrackingStore, useDailyTracking } from "./daily-tracking-store";
import { useSleepDaily } from "./sleep-store";
import { useActivity } from "./activity-store";
import { useHealthProfile } from "./health-profile-store";
import { useWeightCheckInStatus } from "./weight-store";
import { localDateKey, localDateKeyFromIso } from "./weight-utils";
import { useNutritionPlan } from "./nutrition-plan-store";
import { authStore, useAuth } from "../auth/auth-store";
import { journeyPlanDay } from "./journey-plan";
import { msUntilNextLocalDay } from "./daily-data-readiness";
import { buildJourney } from "./journey-engine";
import { usePlanMealDecisions } from "./use-plan-meal-decisions";

/** Shared source adapter. Refreshes wall-clock decisions across midnight and tab resume. */
export function useJourneyEngine() {
  const meals = useMeals();
  const plan = useNutritionPlan();
  const auth = useAuth();
  const mealsReadiness = useMealsReadiness();
  const tracking = useDailyTracking();
  const activity = useActivity();
  const sleep = useSleepDaily();
  const profile = useHealthProfile();
  const checkIn = useWeightCheckInStatus();
  const [clock, setNow] = React.useState<Date | null>(null);
  // Store rollover can render before the next clock tick. Use the actual local time.
  const now = clock ? new Date() : null;
  React.useEffect(() => {
    let previousDay = localDateKey(new Date());
    const tick = () => {
      const current = new Date();
      const currentDay = localDateKey(current);
      if (currentDay !== previousDay) {
        previousDay = currentDay;
        // Existing stores clear yesterday's cache at rollover. Read the new
        // day's authoritative records once through the existing clock/resume path.
        if (authStore.getSnapshot().status === "authenticated")
          void Promise.allSettled([
            mealsStore.hydrateMealsFromBackend(),
            dailyTrackingStore.hydrateWaterFromBackend(),
          ]);
      }
      setNow(current);
    };
    tick();
    const timer = setInterval(tick, 30_000);
    const midnight = setTimeout(tick, msUntilNextLocalDay());
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      clearTimeout(midnight);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, []);
  const today = now ? localDateKey(now) : null;
  const planReady =
    auth.status === "authenticated" && plan.ownerUserId === auth.user?.id && plan.hydrated;
  const planDay = React.useMemo(() => journeyPlanDay(today && planReady ? plan.activePlan : null, today ? new Date(`${today}T12:00:00`) : new Date()), [today, planReady, plan.activePlan]);
  const planDecisions = usePlanMealDecisions(planDay.meals, auth.user?.id, today);
  return {
    ...buildJourney({
      plannedMeals: planDay.meals,
      planDecisions: planDecisions.values,
      nowMs: now?.getTime(),
      localHour: now?.getHours() ?? 0,
      startWeightKg: profile.startWeightKg || null,
      currentWeightKg: profile.currentWeightKg || null,
      targetWeightKg: profile.targetWeightKg || null,
      workScheduleType: profile.workScheduleType,
      foodCounts: Object.fromEntries(meals.map((meal) => [meal.slot, meal.foods.length])),
      meals: Object.fromEntries(
        meals.map((meal) => [
          meal.slot,
          today && mealsReadiness !== "UNKNOWN" ? meal.foods.length + (meal.isEaten ? 1 : 0) : null,
        ]),
      ),
      waterMl:
        today && tracking.dayKey === today && tracking.waterReadiness !== "UNKNOWN"
          ? tracking.waterMl
          : null,
      waterGoalMl: tracking.waterGoalMl || null,
      activityMinutes:
        today && activity.dayKey === today && activity.readiness !== "UNKNOWN"
          ? activity.activeMinutes
          : null,
      sleepMinutes:
        today && sleep.dayKey === today && sleep.readiness !== "UNKNOWN"
          ? (sleep.assessment?.totalDurationMinutes ?? null)
          : null,
      weight:
        now && checkIn
          ? {
              recordedToday: Boolean(
                checkIn.lastLoggedAt && localDateKeyFromIso(checkIn.lastLoggedAt) === today,
              ),
              due:
                checkIn.active &&
                (checkIn.nextDueAt
                  ? now.getTime() >= new Date(checkIn.nextDueAt).getTime()
                  : checkIn.required),
            }
          : null,
    }),
    dayKey: today,
    planReady,
    planValidity: planDay,
    planReadError: plan.readError,
    planRefreshing: plan.loading && planReady,
    planDecisions,
  };
}
