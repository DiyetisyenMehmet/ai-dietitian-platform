import type { MealLog, WaterLog, WeightLog } from "@prisma/client";

import { logger } from "../../lib/logger";
import { ApiError } from "../../utils/api-error";
import { nutritionAdaptationService } from "../ai-coach/nutrition-adaptation.service";
import { trackingRepository } from "./tracking.repository";
import type {
  CreateMealLogInput,
  CreateWaterLogInput,
  CreateWeightLogInput,
} from "./tracking.schemas";

/** Parses an optional ISO string into a Date, or undefined. */
function toDate(iso?: string): Date | undefined {
  return iso ? new Date(iso) : undefined;
}

/**
 * Tracking service. Persists the time-series signals the AI Health Coach
 * depends on. Saving a weight entry additionally triggers Dynamic Nutrition
 * Adaptation as a best-effort, non-blocking hook.
 */
export const trackingService = {
  async logWeight(userId: string, input: CreateWeightLogInput): Promise<WeightLog> {
    const log = await trackingRepository.createWeightLog({
      userId,
      weightKg: input.weightKg,
      note: input.note,
      loggedAt: toDate(input.loggedAt),
    });

    // Hook: re-evaluate the nutrition plan after a new weight signal.
    void nutritionAdaptationService.analyzeAndAdapt(userId).catch((error: unknown) => {
      logger.warn({ err: error, userId }, "Nutrition adaptation after weight log failed");
    });

    return log;
  },

  listWeight(userId: string, since?: Date): Promise<WeightLog[]> {
    return trackingRepository.listWeightLogs(userId, since);
  },

  logMeal(userId: string, input: CreateMealLogInput): Promise<MealLog> {
    return trackingRepository.createMealLog({
      userId,
      mealType: input.mealType,
      name: input.name,
      calories: input.calories,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
      sodiumMg: input.sodiumMg,
      sugarG: input.sugarG,
      loggedAt: toDate(input.loggedAt),
    });
  },

  listMeals(userId: string, since?: Date): Promise<MealLog[]> {
    return trackingRepository.listMealLogs(userId, since);
  },

  async deleteMeal(userId: string, id: string): Promise<void> {
    const deleted = await trackingRepository.deleteMealLogForUser(id, userId);
    if (deleted.count === 0) {
      throw ApiError.notFound("Meal log not found.");
    }
  },

  logWater(userId: string, input: CreateWaterLogInput): Promise<WaterLog> {
    return trackingRepository.createWaterLog({
      userId,
      amountMl: input.amountMl,
      loggedAt: toDate(input.loggedAt),
    });
  },

  listWater(userId: string, since?: Date): Promise<WaterLog[]> {
    return trackingRepository.listWaterLogs(userId, since);
  },
};
