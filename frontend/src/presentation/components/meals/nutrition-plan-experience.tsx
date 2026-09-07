"use client";

import * as React from "react";

import { useNutritionPlan } from "@/application/health/nutrition-plan-store";
import type { NutritionPlanRecord } from "@/infrastructure/nutrition/nutrition-plan-client";
import { NutritionPlanHungerCoach } from "@/presentation/components/meals/nutrition-plan-hunger-coach";
import { NutritionPlanReminders, type NutritionReminderEntry } from "@/presentation/components/meals/nutrition-plan-reminders";
import { NutritionPlanShareButton } from "@/presentation/components/meals/nutrition-plan-share-button";
import { NutritionPlanView } from "@/presentation/components/meals/nutrition-plan-view";

function startDate(plan: NutritionPlanRecord): Date {
  const dateOnly = plan.startDate?.slice(0, 10);
  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  const fallback = new Date(plan.createdAt);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

function dateForDay(plan: NutritionPlanRecord, dayNumber: number): Date {
  const date = startDate(plan);
  const mapping = plan.dailyPlans?.calendar?.find((item) => item.dayNumber === dayNumber);
  const offset = Math.max(0, Math.trunc(mapping?.dateOffsetDays ?? 0));
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayNumber - 1 + offset);
  return date;
}

function mealTime(value: string): { hour: number; minute: number } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function localDateYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayHasMidnightWrap(plan: NutritionPlanRecord, dayNumber: number): boolean {
  const mapping = plan.dailyPlans?.calendar?.find((item) => item.dayNumber === dayNumber);
  const cycleIndex = mapping?.cycleIndex ?? dayNumber - 1;
  const meals = plan.dailyPlans?.cycle?.[cycleIndex]?.meals ?? [];
  let previous = -1;
  for (const meal of meals) {
    const parsed = mealTime(meal.time);
    if (!parsed) continue;
    const minutes = parsed.hour * 60 + parsed.minute;
    if (previous >= 0 && minutes <= previous) return true;
    previous = minutes;
  }
  return false;
}

function currentPlanDayNumber(plan: NutritionPlanRecord, now = new Date()): number | null {
  const content = plan.dailyPlans;
  if (!content?.durationDays) return null;

  for (let dayNumber = 1; dayNumber <= content.durationDays; dayNumber += 1) {
    const baseDate = dateForDay(plan, dayNumber);
    if (localDateYmd(baseDate) === localDateYmd(now)) return dayNumber;

    if (dayHasMidnightWrap(plan, dayNumber)) {
      const nextDate = new Date(baseDate);
      nextDate.setDate(nextDate.getDate() + 1);
      if (localDateYmd(nextDate) === localDateYmd(now)) {
        const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
        const cycleIndex = mapping?.cycleIndex ?? dayNumber - 1;
        const firstMeal = content.cycle?.[cycleIndex]?.meals?.[0];
        const first = firstMeal ? mealTime(firstMeal.time) : null;
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const firstMinutes = first ? first.hour * 60 + first.minute : 0;
        if (currentMinutes < firstMinutes) return dayNumber;
      }
    }
  }
  return null;
}

function reminderEntries(plan: NutritionPlanRecord): NutritionReminderEntry[] {
  const content = plan.dailyPlans;
  if (!content?.cycle?.length) return [];
  const entries: NutritionReminderEntry[] = [];

  for (let dayNumber = 1; dayNumber <= content.durationDays; dayNumber += 1) {
    const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
    const cycleIndex = mapping?.cycleIndex ?? dayNumber - 1;
    const day = content.cycle[cycleIndex];
    if (!day) continue;
    const date = dateForDay(plan, dayNumber);
    let previousMinutes = -1;
    let dayOffset = 0;

    day.meals.forEach((meal, mealIndex) => {
      const time = mealTime(meal.time);
      if (!time) return;
      const minutes = time.hour * 60 + time.minute;
      if (previousMinutes >= 0 && minutes <= previousMinutes) dayOffset += 1;
      previousMinutes = minutes;
      const at = new Date(date);
      at.setDate(at.getDate() + dayOffset);
      at.setHours(time.hour, time.minute, 0, 0);
      entries.push({ id: `${plan.id}:${dayNumber}:${mealIndex}`, at: at.getTime() });
    });
  }

  return entries;
}

function shareableDays(plan: NutritionPlanRecord) {
  const content = plan.dailyPlans;
  if (!content?.cycle?.length) return [];
  const formatter = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return Array.from({ length: content.durationDays }, (_, index) => index + 1).flatMap((dayNumber) => {
    const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
    const cycleIndex = mapping?.cycleIndex ?? ((dayNumber - 1) % content.cycle.length);
    const day = content.cycle[cycleIndex];
    if (!day) return [];
    return [{ dayNumber, dateLabel: formatter.format(dateForDay(plan, dayNumber)), day }];
  });
}

function completed(plan: NutritionPlanRecord): boolean {
  const days = plan.dailyPlans?.durationDays ?? 0;
  if (days <= 0) return true;
  const last = dateForDay(plan, days);
  last.setHours(23, 59, 59, 999);
  return Date.now() > last.getTime();
}

/** Full professional plan experience: plan management plus optional local reminders. */
export function NutritionPlanExperience() {
  const { activePlan } = useNutritionPlan();

  React.useEffect(() => {
    if (activePlan) return;
    try {
      window.DiewishReminders?.cancelAll();
    } catch {
      // An optional native capability must never break the web plan experience.
    }
  }, [activePlan]);

  const days = activePlan?.duration === "SIXTY_DAY" ? [] : activePlan ? shareableDays(activePlan) : [];
  const hungerDayNumber = activePlan?.duration === "SIXTY_DAY" ? null : activePlan ? currentPlanDayNumber(activePlan) : null;

  return (
    <div className="space-y-5">
      <NutritionPlanView />
      {activePlan && hungerDayNumber !== null && (
        <NutritionPlanHungerCoach planId={activePlan.id} dayNumber={hungerDayNumber} />
      )}
      {activePlan && days.length > 0 && (
        <div className="flex justify-end">
          <NutritionPlanShareButton durationDays={activePlan.dailyPlans?.durationDays ?? days.length} days={days} />
        </div>
      )}
      {activePlan && (
        <NutritionPlanReminders
          entries={reminderEntries(activePlan)}
          completed={completed(activePlan)}
        />
      )}
    </div>
  );
}
