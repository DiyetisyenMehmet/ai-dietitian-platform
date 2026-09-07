import type { NutritionPlanDeviation } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { nutritionPlanRepository } from "./nutrition-plan.repository";
import type { HungerReportInput } from "./dto/nutrition-plan.schemas";
import type { NutritionPlanContent, PlannedMeal } from "./types";

export type HungerDecisionType =
  | "WAIT_FOR_MEAL"
  | "EAT_PLANNED_MEAL"
  | "SMALL_SNACK"
  | "DAY_COMPLETE";

export interface HungerDecisionResult {
  eventId: string;
  decision: HungerDecisionType;
  message: string;
  nextMealIndex: number | null;
  nextMealName: string | null;
  nextMealTime: string | null;
  minutesToNextMeal: number | null;
  previousMealSkipped: boolean;
  suggestedSnackCalories: number | null;
}

function parseClock(value: string): number | null {
  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function planDayDate(planStartDate: Date, content: NutritionPlanContent, dayNumber: number): Date {
  const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
  const offset = Math.max(0, Math.trunc(mapping?.dateOffsetDays ?? 0));
  const date = new Date(planStartDate);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + dayNumber - 1 + offset);
  return date;
}

function orderedMealMinutes(meals: PlannedMeal[]): number[] {
  let dayOffset = 0;
  let previous = -1;
  return meals.map((meal) => {
    const clock = parseClock(meal.time);
    if (clock === null) {
      throw ApiError.badRequest("Plan öğün saatleri güvenli biçimde değerlendirilemiyor.");
    }
    let value = clock + dayOffset;
    if (value <= previous) {
      dayOffset += 1440;
      value = clock + dayOffset;
    }
    previous = value;
    return value;
  });
}

function skippedMealIndexes(deviations: NutritionPlanDeviation[], mealCount: number): Set<number> {
  const skipped = new Set<number>();
  for (const deviation of deviations) {
    if (deviation.type !== "SKIPPED") continue;
    if (deviation.scope === "DAY") {
      for (let index = 0; index < mealCount; index += 1) skipped.add(index);
    } else if (deviation.scope === "MEAL" && deviation.mealIndex !== null) {
      skipped.add(deviation.mealIndex);
    }
  }
  return skipped;
}

function snackBudget(dailyCalories: number): number {
  const rounded = Math.round((dailyCalories * 0.06) / 10) * 10;
  return Math.min(200, Math.max(100, rounded));
}

function buildDecision(params: {
  hungerLevel: HungerReportInput["hungerLevel"];
  minutesToNextMeal: number | null;
  minutesSincePreviousMeal: number | null;
  previousMealSkipped: boolean;
  nextMealName: string | null;
  nextMealTime: string | null;
  dailyCalories: number;
}): Omit<HungerDecisionResult, "eventId" | "nextMealIndex"> {
  const {
    hungerLevel,
    minutesToNextMeal,
    minutesSincePreviousMeal,
    previousMealSkipped,
    nextMealName,
    nextMealTime,
    dailyCalories,
  } = params;

  if (minutesToNextMeal !== null && minutesToNextMeal <= 45) {
    return {
      decision: "EAT_PLANNED_MEAL",
      message: `Planındaki ${nextMealName ?? "öğün"} çok yakında (${nextMealTime ?? ""}). Ekstra bir ara öğün yerine planlanan öğününü tercih etmen daha dengeli olur.`,
      nextMealName,
      nextMealTime,
      minutesToNextMeal,
      previousMealSkipped,
      suggestedSnackCalories: null,
    };
  }

  const skippedAndHungry =
    previousMealSkipped &&
    (minutesSincePreviousMeal ?? 0) >= 90 &&
    (minutesToNextMeal === null || minutesToNextMeal > 90);
  const strongHunger =
    hungerLevel === "VERY_HUNGRY" &&
    (minutesToNextMeal === null || minutesToNextMeal > 60);
  const longWait = hungerLevel === "HUNGRY" && (minutesToNextMeal ?? 999) > 180;

  if (skippedAndHungry || strongHunger || longWait) {
    const calories = snackBudget(dailyCalories);
    return {
      decision: "SMALL_SNACK",
      message:
        minutesToNextMeal === null
          ? `Açlığın belirgin. Günlük hedefini gereksiz aşmadan yaklaşık ${calories} kcal'lik küçük ve tok tutucu bir ara öğün uygun olabilir.`
          : `Bir sonraki öğününe yaklaşık ${Math.max(1, Math.round(minutesToNextMeal / 60))} saat var. Açlığını yönetmek ve sonraki öğünde aşırı acıkmayı önlemek için yaklaşık ${calories} kcal'lik küçük bir ara öğün uygun olabilir.`,
      nextMealName,
      nextMealTime,
      minutesToNextMeal,
      previousMealSkipped,
      suggestedSnackCalories: calories,
    };
  }

  if (minutesToNextMeal !== null) {
    return {
      decision: "WAIT_FOR_MEAL",
      message: `Bir sonraki planlı öğünün ${nextMealTime ?? "yakında"}. Açlığın hafifse planlanan öğününü bekleyebilir, su içip kısa süre sonra açlığını yeniden değerlendirebilirsin. Belirginleşirse tekrar “Acıktım” diyebilirsin.`,
      nextMealName,
      nextMealTime,
      minutesToNextMeal,
      previousMealSkipped,
      suggestedSnackCalories: null,
    };
  }

  return {
    decision: "DAY_COMPLETE",
    message:
      "Bugünkü planlı öğünlerin tamamlanmış görünüyor. Açlığın sık tekrarlıyor veya belirginse bunu sonraki plan ayarlamalarında dikkate alacağız; sırf saat geç olduğu için aç kalman gerekmiyor.",
    nextMealName: null,
    nextMealTime: null,
    minutesToNextMeal: null,
    previousMealSkipped,
    suggestedSnackCalories: null,
  };
}

export const nutritionPlanHungerService = {
  async report(
    userId: string,
    planId: string,
    input: HungerReportInput,
  ): Promise<HungerDecisionResult> {
    const plan = await nutritionPlanRepository.findByIdForUser(planId, userId);
    if (!plan || plan.deletedAt) throw ApiError.notFound("Nutrition plan not found.");

    const content = plan.dailyPlans as unknown as NutritionPlanContent;
    if (!content?.cycle?.length || input.dayNumber < 1 || input.dayNumber > content.durationDays) {
      throw ApiError.badRequest("The selected plan day is unavailable.");
    }

    const mapping = content.calendar?.find((item) => item.dayNumber === input.dayNumber);
    const cycleIndex = mapping?.cycleIndex ?? input.dayNumber - 1;
    const day = content.cycle[cycleIndex];
    if (!day?.meals?.length) throw ApiError.badRequest("The selected plan day has no meals.");

    const mealMinutes = orderedMealMinutes(day.meals);
    const currentClock = parseClock(input.localTime);
    if (currentClock === null) throw ApiError.badRequest("localTime must use HH:mm.");

    const wrapsMidnight = mealMinutes.some((value) => value >= 1440);
    const firstClock = mealMinutes[0] % 1440;
    const currentMinute = wrapsMidnight && currentClock < firstClock ? currentClock + 1440 : currentClock;

    const expectedDate = planDayDate(plan.startDate, content, input.dayNumber);
    if (currentMinute >= 1440) expectedDate.setUTCDate(expectedDate.getUTCDate() + 1);
    if (ymd(expectedDate) !== input.localDate) {
      throw ApiError.badRequest("Acıktım değerlendirmesi yalnızca bugünkü aktif plan günü için yapılabilir.");
    }

    const deviations = await prisma.nutritionPlanDeviation.findMany({
      where: { userId, planId, dayNumber: input.dayNumber },
      orderBy: { createdAt: "asc" },
    });
    const skipped = skippedMealIndexes(deviations, day.meals.length);

    let previousIndex: number | null = null;
    let nextIndex: number | null = null;
    for (let index = 0; index < mealMinutes.length; index += 1) {
      if (mealMinutes[index] <= currentMinute) previousIndex = index;
      if (mealMinutes[index] > currentMinute && nextIndex === null) nextIndex = index;
    }

    const minutesSincePreviousMeal =
      previousIndex === null ? null : currentMinute - mealMinutes[previousIndex];
    const minutesToNextMeal = nextIndex === null ? null : mealMinutes[nextIndex] - currentMinute;
    const previousMealSkipped = previousIndex !== null && skipped.has(previousIndex);
    const nextMeal = nextIndex === null ? null : day.meals[nextIndex];

    const decision = buildDecision({
      hungerLevel: input.hungerLevel,
      minutesToNextMeal,
      minutesSincePreviousMeal,
      previousMealSkipped,
      nextMealName: nextMeal?.name ?? null,
      nextMealTime: nextMeal?.time ?? null,
      dailyCalories: plan.dailyCalories,
    });

    // Store the user-reported event as a bounded meal-habit memory. Future plan
    // personalization can aggregate repeated hunger windows without mutating the
    // immutable plan snapshot that produced this recommendation.
    const event = await prisma.aiMemory.create({
      data: {
        userId,
        memoryType: "MEAL_HABITS",
        content: {
          kind: "HUNGER_EVENT",
          planId,
          planVersion: plan.version,
          dayNumber: input.dayNumber,
          localDate: input.localDate,
          localTime: input.localTime,
          hungerLevel: input.hungerLevel,
          decision: decision.decision,
          nextMealIndex: nextIndex,
          nextMealTime: decision.nextMealTime,
          minutesToNextMeal: decision.minutesToNextMeal,
          previousMealSkipped,
          suggestedSnackCalories: decision.suggestedSnackCalories,
        },
      },
    });

    return { eventId: event.id, nextMealIndex: nextIndex, ...decision };
  },
};
