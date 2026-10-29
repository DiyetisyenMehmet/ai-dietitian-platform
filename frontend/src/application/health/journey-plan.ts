import type { MealSlot } from "@/domain/meals/types";
import type {
  NutritionPlanRecord,
  PlannedMeal,
} from "@/infrastructure/nutrition/nutrition-plan-client";
import { dateForMealPlanDay, parseMealReminderTime } from "@/domain/account/meal-reminder-plan";
import { localDayKey } from "./daily-data-readiness";
import type { PlanMealIdentity } from "./plan-meal-decisions";

export interface JourneyPlannedMeal {
  key: string;
  meal: PlannedMeal;
  slot: MealSlot | null;
  at: number;
  timing?: "now" | "upcoming" | "earlier";
  identity?: PlanMealIdentity;
  foodSlot?: MealSlot | null;
}

export interface JourneyPlanDay {
  status: "none" | "unavailable" | "upcoming" | "expired" | "active" | "no-meals";
  startsOn: string | null;
  endsOn: string | null;
  meals: JourneyPlannedMeal[];
}

/** Exact names only. Multiple occurrences of a slot cannot be checked in separately. */
export function journeyMealSlot(name: string): MealSlot | null {
  const normalized = name.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
  return (
    (
      {
        kahvaltı: "breakfast",
        breakfast: "breakfast",
        öğle: "lunch",
        "öğle yemeği": "lunch",
        lunch: "lunch",
        akşam: "dinner",
        "akşam yemeği": "dinner",
        dinner: "dinner",
        ara: "snack",
        "ara öğün": "snack",
        snack: "snack",
      } as Record<string, MealSlot>
    )[normalized] ?? null
  );
}

/** Read-only adapter for the existing plan calendar, in the device's local timezone.
 * No createdAt fallback, modulo cycle guess or synthetic menu is permitted here.
 */
function calendarPlanMeals(plan: NutritionPlanRecord): JourneyPlannedMeal[] | null {
  if (!plan.isActive || plan.deletedAt || plan.status !== "COMPLETED") return null;
  const key = plan.startDate?.slice(0, 10);
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  if (localDayKey(new Date(year, month - 1, day, 12)) !== key) return null;
  const content = plan.dailyPlans;
  if (
    !Array.isArray(content?.calendar) ||
    !Array.isArray(content?.cycle) ||
    !Number.isInteger(content.durationDays) ||
    content.durationDays < 1 ||
    content.calendar.length !== content.durationDays
  )
    return null;
  const result: JourneyPlannedMeal[] = [];
  const seen = new Set<number>();
  for (const mapping of content.calendar) {
    if (
      !Number.isInteger(mapping.dayNumber) ||
      mapping.dayNumber < 1 ||
      mapping.dayNumber > content.durationDays ||
      seen.has(mapping.dayNumber) ||
      !Number.isInteger(mapping.cycleIndex) ||
      mapping.cycleIndex < 0 ||
      !Number.isInteger(mapping.dateOffsetDays ?? 0) ||
      (mapping.dateOffsetDays ?? 0) < 0
    )
      return null;
    seen.add(mapping.dayNumber);
    const meals = content.cycle[mapping.cycleIndex]?.meals;
    if (!Array.isArray(meals)) return null;
    const date = dateForMealPlanDay(plan, mapping.dayNumber);
    let previous = -1,
      offset = 0;
    for (const [index, meal] of meals.entries()) {
      const time = typeof meal.time === "string" ? parseMealReminderTime(meal.time) : null;
      if (
        !time ||
        !meal.name?.trim() ||
        !Array.isArray(meal.foods) ||
        meal.foods.length === 0 ||
        meal.foods.some((food) => !food.name?.trim() || !food.portion?.trim())
      )
        return null;
      const minutes = time.hour * 60 + time.minute;
      if (previous >= 0 && minutes <= previous) offset++;
      previous = minutes;
      const at = new Date(date);
      at.setDate(at.getDate() + offset);
      at.setHours(time.hour, time.minute, 0, 0);
      result.push({
        key: `${plan.id}:${mapping.dayNumber}:${index}`,
        meal,
        slot: journeyMealSlot(meal.name),
        foodSlot: journeyMealSlot(meal.name),
        identity: { planId: plan.id, planVersion: plan.version, dayNumber: mapping.dayNumber, mealIndex: index, localDate: localDayKey(at) },
        at: at.getTime(),
      });
    }
  }
  return result.sort((a, b) => a.at - b.at);
}

/** Classifies the same validated calendar, including postponed and overnight meals. */
export function journeyPlanDay(plan: NutritionPlanRecord | null, now: Date): JourneyPlanDay {
  const empty = { startsOn: null, endsOn: null, meals: [] };
  if (!plan) return { ...empty, status: "none" };
  const calendar = calendarPlanMeals(plan);
  if (!calendar?.length || !Number.isFinite(now.getTime()))
    return { ...empty, status: "unavailable" };
  const startsOn = localDayKey(new Date(calendar[0].at));
  const endsOn = localDayKey(new Date(calendar[calendar.length - 1].at));
  const today = localDayKey(now);
  const result = calendar.filter((entry) => localDayKey(new Date(entry.at)) === today);
  const counts = new Map<MealSlot, number>();
  for (const entry of result)
    if (entry.slot) counts.set(entry.slot, (counts.get(entry.slot) ?? 0) + 1);
  for (const entry of result) if (entry.slot && counts.get(entry.slot)! > 1) entry.slot = null;
  return {
    startsOn,
    endsOn,
    meals: result,
    status:
      today < startsOn
        ? "upcoming"
        : today > endsOn
          ? "expired"
          : result.length
            ? "active"
            : "no-meals",
  };
}

export function journeyPlanMeals(
  plan: NutritionPlanRecord | null,
  now: Date,
): JourneyPlannedMeal[] {
  return journeyPlanDay(plan, now).meals;
}
