import type { NutritionPlan } from "@prisma/client";
import { z } from "zod";

import { ApiError } from "../../utils/api-error";
import type { CheckInDay } from "./meal-check-in.schemas";

const contentSchema = z.object({
  durationDays: z.number().int().min(1).max(60),
  cycle: z.array(z.object({ meals: z.array(z.object({
    name: z.string().trim().min(1), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    foods: z.array(z.object({ name: z.string().trim().min(1), portion: z.string().trim().min(1) })).min(1).max(100),
  })).max(12) })).min(1).max(60),
  calendar: z.array(z.object({
    dayNumber: z.number().int().min(1).max(60), cycleIndex: z.number().int().min(0).max(59),
    dateOffsetDays: z.number().int().min(0).max(3660).optional(),
  })).min(1).max(60),
});

/** Exact persisted mapping, including plan pauses and midnight rollovers. */
export function resolveCheckInDay(plan: NutritionPlan, input: CheckInDay) {
  if (plan.deletedAt || !plan.isActive || plan.status !== "COMPLETED") {
    throw ApiError.conflict("The nutrition plan is no longer active.");
  }
  const parsed = contentSchema.safeParse(plan.dailyPlans);
  if (!parsed.success) throw ApiError.conflict("The plan calendar is not trackable.");
  const { calendar, durationDays, cycle } = parsed.data;
  if (calendar.length !== durationDays || new Set(calendar.map((d) => d.dayNumber)).size !== durationDays ||
      calendar.some((d) => d.dayNumber > durationDays || !cycle[d.cycleIndex])) {
    throw ApiError.conflict("The plan calendar is ambiguous.");
  }
  const mapping = calendar.find((d) => d.dayNumber === input.dayNumber);
  if (!mapping) throw ApiError.unprocessable("The selected plan day does not exist.");
  const base = new Date(plan.startDate);
  base.setUTCDate(base.getUTCDate() + mapping.dayNumber - 1 + (mapping.dateOffsetDays ?? 0));
  const planDate = base.toISOString().slice(0, 10);
  let previous = -1;
  let rollover = 0;
  const allMeals = cycle[mapping.cycleIndex].meals.map((meal, mealIndex) => {
    const [hour, minute] = meal.time.split(":").map(Number);
    const minutes = hour * 60 + minute;
    if (previous >= 0 && minutes <= previous) rollover++;
    previous = minutes;
    const date = new Date(base);
    date.setUTCDate(date.getUTCDate() + rollover);
    return { mealIndex, localDate: date.toISOString().slice(0, 10), scheduledTime: meal.time };
  });
  const meals = allMeals.filter((m) => m.localDate === input.localDate);
  if (!meals.length && !(allMeals.length === 0 && input.localDate === planDate)) {
    throw ApiError.unprocessable("localDate does not match this plan's scheduled meals.");
  }
  return { planVersion: plan.version, planDate, meals };
}
