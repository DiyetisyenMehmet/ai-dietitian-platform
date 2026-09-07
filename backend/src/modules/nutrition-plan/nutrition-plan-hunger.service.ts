import type { NutritionPlanDeviation, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import {
  chooseAdaptiveSnack,
  plannedSnackSuggestion,
  type AdaptiveSnackSuggestion,
} from "./adaptive-snack";
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
  suggestedSnack: AdaptiveSnackSuggestion | null;
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

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numericValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function snackToJson(snack: AdaptiveSnackSuggestion): Prisma.InputJsonObject {
  return {
    name: snack.name,
    foods: snack.foods.map((food) => ({
      name: food.name,
      portion: food.portion,
      calories: food.calories,
    })),
    calories: snack.calories,
    proteinGrams: snack.proteinGrams,
    carbsGrams: snack.carbsGrams,
    fatGrams: snack.fatGrams,
    source: snack.source,
    sourceMealIndex: snack.sourceMealIndex,
  };
}

function parseSnackSuggestion(value: unknown): AdaptiveSnackSuggestion | null {
  const record = objectValue(value);
  if (!record || typeof record.name !== "string") return null;
  if (
    record.source !== "SKIPPED_MEAL_BUDGET" &&
    record.source !== "PLANNED_SNACK_REALLOCATION"
  ) {
    return null;
  }

  const foods = Array.isArray(record.foods)
    ? record.foods.flatMap((item) => {
        const food = objectValue(item);
        if (!food || typeof food.name !== "string" || typeof food.portion !== "string") return [];
        return [
          {
            name: food.name,
            portion: food.portion,
            calories: numericValue(food.calories),
          },
        ];
      })
    : [];
  if (!foods.length) return null;

  const rawSourceMealIndex = record.sourceMealIndex;
  const sourceMealIndex =
    rawSourceMealIndex === null || rawSourceMealIndex === undefined
      ? null
      : numericValue(rawSourceMealIndex);

  return {
    name: record.name,
    foods,
    calories: numericValue(record.calories),
    proteinGrams: numericValue(record.proteinGrams),
    carbsGrams: numericValue(record.carbsGrams),
    fatGrams: numericValue(record.fatGrams),
    source: record.source,
    sourceMealIndex:
      sourceMealIndex !== null && Number.isInteger(sourceMealIndex) && sourceMealIndex >= 0
        ? sourceMealIndex
        : null,
  };
}

function acceptedSnackState(
  memories: Array<{ content: unknown }>,
  planId: string,
  dayNumber: number,
): { skippedBudgetCaloriesUsed: number; usedPlannedSnackIndexes: Set<number> } {
  let skippedBudgetCaloriesUsed = 0;
  const usedPlannedSnackIndexes = new Set<number>();

  for (const memory of memories) {
    const content = objectValue(memory.content);
    if (
      content?.kind !== "ADDED_SNACK" ||
      content.planId !== planId ||
      numericValue(content.dayNumber) !== dayNumber
    ) {
      continue;
    }
    const snack = parseSnackSuggestion(content.snack);
    if (!snack) continue;
    if (snack.source === "SKIPPED_MEAL_BUDGET") {
      skippedBudgetCaloriesUsed += snack.calories;
    }
    if (snack.source === "PLANNED_SNACK_REALLOCATION" && snack.sourceMealIndex !== null) {
      usedPlannedSnackIndexes.add(snack.sourceMealIndex);
    }
  }

  return { skippedBudgetCaloriesUsed, usedPlannedSnackIndexes };
}

function isSnackSlot(planMealTiming: unknown, meal: PlannedMeal, mealIndex: number): boolean {
  if (/snack|ara\s*öğün/i.test(meal.name)) return true;
  const timing = objectValue(planMealTiming);
  const slots = Array.isArray(timing?.slots) ? timing.slots : [];
  const slot = objectValue(slots[mealIndex]);
  return typeof slot?.name === "string" && /snack|ara\s*öğün/i.test(slot.name);
}

function buildDecision(params: {
  hungerLevel: HungerReportInput["hungerLevel"];
  minutesToNextMeal: number | null;
  minutesSincePreviousMeal: number | null;
  previousMealSkipped: boolean;
  nextMealName: string | null;
  nextMealTime: string | null;
  dailyCalories: number;
}): Omit<HungerDecisionResult, "eventId" | "nextMealIndex" | "suggestedSnack"> {
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
    return {
      decision: "SMALL_SNACK",
      message:
        minutesToNextMeal === null
          ? "Açlığın belirgin. Günün plan bütçesini aşmadan uygun bir ara öğün seçeneği olup olmadığını kontrol ediyorum."
          : `Bir sonraki öğününe yaklaşık ${Math.max(1, Math.round(minutesToNextMeal / 60))} saat var. Plan bütçeni aşmadan uygun bir ara öğün seçeneği olup olmadığını kontrol ediyorum.`,
      nextMealName,
      nextMealTime,
      minutesToNextMeal,
      previousMealSkipped,
      suggestedSnackCalories: snackBudget(dailyCalories),
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

    const [deviations, recentMealHabits] = await Promise.all([
      prisma.nutritionPlanDeviation.findMany({
        where: { userId, planId, dayNumber: input.dayNumber },
        orderBy: { createdAt: "asc" },
      }),
      prisma.aiMemory.findMany({
        where: { userId, memoryType: "MEAL_HABITS" },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { content: true },
      }),
    ]);
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

    let decision = buildDecision({
      hungerLevel: input.hungerLevel,
      minutesToNextMeal,
      minutesSincePreviousMeal,
      previousMealSkipped,
      nextMealName: nextMeal?.name ?? null,
      nextMealTime: nextMeal?.time ?? null,
      dailyCalories: plan.dailyCalories,
    });

    let suggestedSnack: AdaptiveSnackSuggestion | null = null;
    if (decision.decision === "SMALL_SNACK") {
      const accepted = acceptedSnackState(recentMealHabits, planId, input.dayNumber);
      const futurePlannedSnackIndex = day.meals.findIndex(
        (meal, index) =>
          mealMinutes[index] > currentMinute &&
          !skipped.has(index) &&
          !accepted.usedPlannedSnackIndexes.has(index) &&
          isSnackSlot(plan.mealTiming, meal, index),
      );

      if (futurePlannedSnackIndex >= 0) {
        suggestedSnack = plannedSnackSuggestion(
          day.meals[futurePlannedSnackIndex],
          futurePlannedSnackIndex,
        );
      } else {
        const skippedIndexes = [...skipped].filter((index) => mealMinutes[index] <= currentMinute);
        const freedCalories = skippedIndexes.reduce(
          (sum, index) => sum + Math.max(0, day.meals[index]?.calories ?? 0),
          0,
        );
        const freedMacros = skippedIndexes.reduce(
          (sum, index) => ({
            proteinGrams: sum.proteinGrams + Math.max(0, day.meals[index]?.proteinGrams ?? 0),
            carbsGrams: sum.carbsGrams + Math.max(0, day.meals[index]?.carbsGrams ?? 0),
            fatGrams: sum.fatGrams + Math.max(0, day.meals[index]?.fatGrams ?? 0),
          }),
          { proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
        );
        const availableCalories = Math.max(
          0,
          freedCalories - accepted.skippedBudgetCaloriesUsed,
        );
        const calorieBudget = Math.min(snackBudget(plan.dailyCalories), availableCalories);
        const profile = await prisma.userProfile.findUnique({ where: { userId } });
        if (profile) {
          suggestedSnack = chooseAdaptiveSnack({
            calorieBudget,
            allergies: profile.allergies,
            dietaryPreference: profile.dietaryPreference,
            freedMacros,
          });
        }
      }

      if (suggestedSnack) {
        decision = {
          ...decision,
          message:
            suggestedSnack.source === "PLANNED_SNACK_REALLOCATION"
              ? `Ekstra kalori eklemek yerine planındaki ${suggestedSnack.name} ara öğününü şimdiye çekebilirsin. Onu şimdi tüketirsen aynı ara öğünü daha sonra tekrar tüketme.`
              : `Atladığın öğünden kalan enerji bütçesinin içinde yaklaşık ${suggestedSnack.calories} kcal'lik ${suggestedSnack.name} uygun bir ara öğün olabilir. Bu öneri günlük hedefinin üzerine ekstra kalori eklemek için oluşturulmadı.`,
          suggestedSnackCalories: suggestedSnack.calories,
        };
      } else {
        decision = {
          ...decision,
          decision: nextMeal
            ? input.hungerLevel === "VERY_HUNGRY"
              ? "EAT_PLANNED_MEAL"
              : "WAIT_FOR_MEAL"
            : "DAY_COMPLETE",
          message: nextMeal
            ? input.hungerLevel === "VERY_HUNGRY"
              ? `Açlığın belirgin ancak günlük plan bütçene güvenle ekleyebileceğim ayrı bir ara öğün kalmadı. Ekstra kalori eklemek yerine ${nextMeal.name} öğününü biraz öne alman daha uygun.`
              : `Günlük plan bütçene güvenle ekleyebileceğim ayrı bir ara öğün kalmadı. ${nextMeal.time} planlı öğününü bekleyebilir, açlığın belirginleşirse öğünü bir miktar öne alabilirsin.`
            : "Bugünkü planlı enerji bütçen tamamlanmış görünüyor. Yeni bir ara öğünü otomatik olarak eklemiyorum.",
          suggestedSnackCalories: null,
        };
      }
    }

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
          suggestedSnack: suggestedSnack ? snackToJson(suggestedSnack) : null,
        },
      },
    });

    return { eventId: event.id, nextMealIndex: nextIndex, suggestedSnack, ...decision };
  },

  async acceptSnack(userId: string, planId: string, eventId: string) {
    const plan = await nutritionPlanRepository.findByIdForUser(planId, userId);
    if (!plan || plan.deletedAt) throw ApiError.notFound("Nutrition plan not found.");

    const event = await prisma.aiMemory.findFirst({
      where: { id: eventId, userId, memoryType: "MEAL_HABITS" },
    });
    const content = objectValue(event?.content);
    if (!event || content?.kind !== "HUNGER_EVENT" || content.planId !== planId) {
      throw ApiError.badRequest("Geçerli bir Acıktım ara öğün önerisi bulunamadı.");
    }
    const snack = parseSnackSuggestion(content.suggestedSnack);
    if (!snack || content.decision !== "SMALL_SNACK") {
      throw ApiError.badRequest("Bu açlık değerlendirmesinde kullanılabilir bir ara öğün yok.");
    }

    const recent = await prisma.aiMemory.findMany({
      where: { userId, memoryType: "MEAL_HABITS" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, content: true },
    });
    const duplicate = recent.find((item) => {
      const record = objectValue(item.content);
      return record?.kind === "ADDED_SNACK" && record.hungerEventId === eventId;
    });
    if (duplicate) {
      return { recordId: duplicate.id, snack, alreadyRecorded: true };
    }

    const dayNumber = numericValue(content.dayNumber);
    const localDate = stringValue(content.localDate);
    const localTime = stringValue(content.localTime);

    const [memory] = await prisma.$transaction([
      prisma.aiMemory.create({
        data: {
          userId,
          memoryType: "MEAL_HABITS",
          content: {
            kind: "ADDED_SNACK",
            planId,
            planVersion: plan.version,
            dayNumber,
            hungerEventId: eventId,
            localDate,
            localTime,
            snack: snackToJson(snack),
          },
        },
      }),
      prisma.mealLog.create({
        data: {
          userId,
          mealType: "SNACK",
          name: snack.name,
          calories: snack.calories,
          proteinG: snack.proteinGrams,
          carbsG: snack.carbsGrams,
          fatG: snack.fatGrams,
        },
      }),
    ]);

    return { recordId: memory.id, snack, alreadyRecorded: false };
  },
};
