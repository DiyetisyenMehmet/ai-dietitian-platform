import type { Activity, Goal, MealLog, WaterLog, WeightLog } from "@prisma/client";

import { ApiError } from "../../utils/api-error";
import {
  addCalendarDays,
  canonicalizeHistoryTimezone,
  dateKeyInTimezone,
  resolveHistoryDayRange,
} from "../history/history-time";
import { goalsRepository } from "./goals.repository";
import {
  GOAL_TYPES,
  type CreateGoalInput,
  type GoalType,
  type UpdateGoalInput,
} from "./goals.schemas";

const MAX_GOALS_PER_USER = 20;

const DEFAULT_TITLES: Record<GoalType, string> = {
  "lose-weight": "Kilo Verme",
  "gain-weight": "Kilo Alma",
  "maintain-weight": "Kiloyu Koruma",
  "daily-calories": "Günlük Kalori",
  protein: "Protein",
  water: "Su",
  steps: "Adım",
  exercise: "Egzersiz",
};

const WEIGHT_TYPES = new Set<GoalType>(["lose-weight", "gain-weight", "maintain-weight"]);

export interface GoalHistoryDto {
  id: string;
  date: string;
  value: number;
  note?: string;
}

export interface GoalDto {
  id: string;
  type: GoalType;
  title: string;
  startValue: number;
  currentValue: number;
  targetValue: number;
  startDate: string;
  targetDate: string;
  reminderTime?: string;
  notes?: string;
  history: GoalHistoryDto[];
}

interface ProgressContext {
  timezone: string;
  today: string;
  recentStart: string;
  currentWeightKg: number | null;
  weight: WeightLog[];
  meals: MealLog[];
  water: WaterLog[];
  activities: Activity[];
}

function toGoalType(value: string): GoalType {
  if ((GOAL_TYPES as readonly string[]).includes(value)) return value as GoalType;
  throw ApiError.internal("Stored goal type is invalid.");
}

function parseDateOnly(value: string): Date {
  return new Date(value + "T00:00:00.000Z");
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function groupByLocalDate<T>(
  items: T[],
  timezone: string,
  dateOf: (item: T) => Date,
  valueOf: (item: T) => number,
  prefix: string,
): GoalHistoryDto[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const date = dateKeyInTimezone(dateOf(item), timezone);
    totals.set(date, (totals.get(date) ?? 0) + valueOf(item));
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      id: prefix + "-" + date,
      date,
      value: Math.round(value * 10) / 10,
    }));
}

function sumForDate<T>(
  items: T[],
  timezone: string,
  today: string,
  dateOf: (item: T) => Date,
  valueOf: (item: T) => number,
): number {
  return items.reduce((sum, item) => {
    if (dateKeyInTimezone(dateOf(item), timezone) !== today) return sum;
    return sum + valueOf(item);
  }, 0);
}

async function loadProgressContext(
  userId: string,
  types: GoalType[],
  timezoneInput?: string,
): Promise<ProgressContext> {
  const timezone = canonicalizeHistoryTimezone(timezoneInput ?? "UTC");
  const today = dateKeyInTimezone(new Date(), timezone);
  const recentStart = addCalendarDays(today, -6);
  const since = resolveHistoryDayRange(recentStart, timezone).fromUtc;

  const needWeight = types.some((type) => WEIGHT_TYPES.has(type));
  const needMeals = types.some((type) => type === "daily-calories" || type === "protein");
  const needWater = types.includes("water");
  const needActivity = types.includes("exercise");

  const [currentWeightKg, weight, meals, water, activities] = await Promise.all([
    needWeight ? goalsRepository.getCurrentWeightKg(userId) : Promise.resolve(null),
    needWeight ? goalsRepository.listRecentWeight(userId, since) : Promise.resolve([]),
    needMeals ? goalsRepository.listRecentMeals(userId, since) : Promise.resolve([]),
    needWater ? goalsRepository.listRecentWater(userId, since) : Promise.resolve([]),
    needActivity ? goalsRepository.listRecentActivities(userId, since) : Promise.resolve([]),
  ]);

  return { timezone, today, recentStart, currentWeightKg, weight, meals, water, activities };
}

function currentValue(type: GoalType, context: ProgressContext): number {
  if (WEIGHT_TYPES.has(type)) {
    return context.currentWeightKg ?? context.weight.at(-1)?.weightKg ?? 0;
  }
  if (type === "daily-calories") {
    return Math.round(
      sumForDate(
        context.meals,
        context.timezone,
        context.today,
        (log) => log.loggedAt,
        (log) => log.calories ?? 0,
      ) * 10,
    ) / 10;
  }
  if (type === "protein") {
    return Math.round(
      sumForDate(
        context.meals,
        context.timezone,
        context.today,
        (log) => log.loggedAt,
        (log) => log.proteinG ?? 0,
      ) * 10,
    ) / 10;
  }
  if (type === "water") {
    return sumForDate(
      context.water,
      context.timezone,
      context.today,
      (log) => log.loggedAt,
      (log) => log.amountMl,
    );
  }
  if (type === "exercise") {
    return context.activities.reduce((sum, item) => sum + item.durationMinutes, 0);
  }

  // There is no durable device/manual step source yet. Never manufacture step progress.
  return 0;
}

function historyFor(type: GoalType, context: ProgressContext): GoalHistoryDto[] {
  if (WEIGHT_TYPES.has(type)) {
    return context.weight.map((log) => ({
      id: log.id,
      date: dateKeyInTimezone(log.loggedAt, context.timezone),
      value: log.weightKg,
      ...(log.note ? { note: log.note } : {}),
    }));
  }
  if (type === "daily-calories") {
    return groupByLocalDate(
      context.meals,
      context.timezone,
      (log) => log.loggedAt,
      (log) => log.calories ?? 0,
      "calories",
    );
  }
  if (type === "protein") {
    return groupByLocalDate(
      context.meals,
      context.timezone,
      (log) => log.loggedAt,
      (log) => log.proteinG ?? 0,
      "protein",
    );
  }
  if (type === "water") {
    return groupByLocalDate(
      context.water,
      context.timezone,
      (log) => log.loggedAt,
      (log) => log.amountMl,
      "water",
    );
  }
  if (type === "exercise") {
    return groupByLocalDate(
      context.activities,
      context.timezone,
      (log) => log.loggedAt,
      (log) => log.durationMinutes,
      "exercise",
    );
  }
  return [];
}

function toDto(goal: Goal, context: ProgressContext): GoalDto {
  const type = toGoalType(goal.type);
  return {
    id: goal.id,
    type,
    title: goal.title,
    startValue: goal.startValue,
    currentValue: currentValue(type, context),
    targetValue: goal.targetValue,
    startDate: dateOnly(goal.startDate),
    targetDate: dateOnly(goal.targetDate),
    ...(goal.reminderTime ? { reminderTime: goal.reminderTime } : {}),
    ...(goal.notes ? { notes: goal.notes } : {}),
    history: historyFor(type, context),
  };
}

async function baselineFor(userId: string, type: GoalType): Promise<number> {
  if (!WEIGHT_TYPES.has(type)) return 0;
  return (await goalsRepository.getCurrentWeightKg(userId)) ?? 0;
}

export const goalsService = {
  async listGoals(userId: string, timezone?: string): Promise<GoalDto[]> {
    const goals = await goalsRepository.listGoals(userId);
    if (goals.length === 0) return [];
    const types = goals.map((goal) => toGoalType(goal.type));
    const context = await loadProgressContext(userId, types, timezone);
    return goals.map((goal) => toDto(goal, context));
  },

  async getGoal(userId: string, id: string, timezone?: string): Promise<GoalDto> {
    const goal = await goalsRepository.findGoal(userId, id);
    if (!goal) throw ApiError.notFound("Goal not found.");
    const context = await loadProgressContext(userId, [toGoalType(goal.type)], timezone);
    return toDto(goal, context);
  },

  async createGoal(userId: string, input: CreateGoalInput, timezone?: string): Promise<GoalDto> {
    if ((await goalsRepository.countGoals(userId)) >= MAX_GOALS_PER_USER) {
      throw ApiError.conflict("Active goal limit reached.");
    }
    const type = input.type as GoalType;
    const goal = await goalsRepository.createGoal({
      userId,
      type,
      title: input.title.trim() || DEFAULT_TITLES[type],
      startValue: await baselineFor(userId, type),
      targetValue: input.targetValue,
      startDate: parseDateOnly(input.startDate),
      targetDate: parseDateOnly(input.targetDate),
      reminderTime: cleanOptional(input.reminderTime),
      notes: cleanOptional(input.notes),
    });
    const context = await loadProgressContext(userId, [type], timezone);
    return toDto(goal, context);
  },

  async updateGoal(
    userId: string,
    id: string,
    input: UpdateGoalInput,
    timezone?: string,
  ): Promise<GoalDto> {
    const existing = await goalsRepository.findGoal(userId, id);
    if (!existing) throw ApiError.notFound("Goal not found.");

    const type = input.type as GoalType;
    const typeChanged = existing.type !== type;
    const updated = await goalsRepository.updateGoal(userId, id, {
      type,
      title: input.title.trim() || DEFAULT_TITLES[type],
      ...(typeChanged ? { startValue: await baselineFor(userId, type) } : {}),
      targetValue: input.targetValue,
      startDate: parseDateOnly(input.startDate),
      targetDate: parseDateOnly(input.targetDate),
      reminderTime: cleanOptional(input.reminderTime) ?? null,
      notes: cleanOptional(input.notes) ?? null,
    });
    if (!updated) throw ApiError.notFound("Goal not found.");

    const context = await loadProgressContext(userId, [type], timezone);
    return toDto(updated, context);
  },

  async deleteGoal(userId: string, id: string): Promise<void> {
    const result = await goalsRepository.deleteGoal(userId, id);
    if (result.count === 0) throw ApiError.notFound("Goal not found.");
  },
};
