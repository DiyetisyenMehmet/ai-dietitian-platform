import type { NutritionPlanRecord } from "../../infrastructure/nutrition/nutrition-plan-client";

export interface MealReminderEntry {
  id: string;
  at: number;
}

export function dateForMealPlanDay(plan: NutritionPlanRecord, dayNumber: number): Date {
  const dateOnly = plan.startDate?.slice(0, 10);
  const [year, month, day] = (dateOnly ?? "").split("-").map(Number);
  const fallback = new Date(plan.createdAt);
  const date =
    dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)
      ? new Date(year, month - 1, day, 12)
      : Number.isNaN(fallback.getTime())
        ? new Date()
        : fallback;
  const mapping = plan.dailyPlans?.calendar?.find((item) => item.dayNumber === dayNumber);
  const offset = Math.max(0, Math.trunc(mapping?.dateOffsetDays ?? 0));
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayNumber - 1 + offset);
  return date;
}

export function parseMealReminderTime(value: string): { hour: number; minute: number } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]),
    minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { hour, minute } : null;
}

/** The plan's existing calendar, postponements and midnight wrap remain authoritative. */
export function buildMealReminderEntries(plan: NutritionPlanRecord): MealReminderEntry[] {
  const content = plan.dailyPlans;
  if (!content?.cycle?.length) return [];
  const entries: MealReminderEntry[] = [];
  for (let dayNumber = 1; dayNumber <= content.durationDays; dayNumber += 1) {
    const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
    const day = content.cycle[mapping?.cycleIndex ?? dayNumber - 1];
    if (!day) continue;
    const date = dateForMealPlanDay(plan, dayNumber);
    let previousMinutes = -1,
      dayOffset = 0;
    day.meals.forEach((meal, mealIndex) => {
      const time = parseMealReminderTime(meal.time);
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

export function activeMealReminderPlan(plans: NutritionPlanRecord[]): NutritionPlanRecord | null {
  return (
    [...plans]
      .filter(
        (plan) =>
          plan.isActive &&
          !plan.deletedAt &&
          plan.status === "COMPLETED" &&
          plan.duration !== "SIXTY_DAY",
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  );
}

export function hasFutureMealReminders(
  plan: NutritionPlanRecord | null,
  now = Date.now(),
): boolean {
  return Boolean(plan && buildMealReminderEntries(plan).some((entry) => entry.at > now));
}
