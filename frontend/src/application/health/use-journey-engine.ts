"use client";

import * as React from "react";
import { useMeals, useMealsReadiness } from "../meals/meals-store";
import { useDailyTracking } from "./daily-tracking-store";
import { useSleepDaily } from "./sleep-store";
import { useActivity } from "./activity-store";
import { useHealthProfile } from "./health-profile-store";
import { useWeightCheckInStatus } from "./weight-store";
import { localDateKey, localDateKeyFromIso } from "./weight-utils";
import { buildJourney } from "./journey-engine";

/** Shared source adapter. Refreshes wall-clock decisions across midnight and tab resume. */
export function useJourneyEngine() {
  const meals = useMeals();
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
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  const today = now ? localDateKey(now) : null;
  return buildJourney({
    localHour: now?.getHours() ?? 0,
    startWeightKg: profile.startWeightKg || null,
    currentWeightKg: profile.currentWeightKg || null,
    targetWeightKg: profile.targetWeightKg || null,
    workScheduleType: profile.workScheduleType,
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
  });
}
