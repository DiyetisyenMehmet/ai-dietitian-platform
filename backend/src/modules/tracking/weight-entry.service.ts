import type { WeightLog } from "@prisma/client";

import { logger } from "../../lib/logger";
import { ApiError } from "../../utils/api-error";
import { nutritionAdaptationService } from "../ai-coach/nutrition-adaptation.service";
import { trackingRepository } from "./tracking.repository";
import type { UpdateWeightLogInput } from "./tracking.schemas";

function toDate(iso?: string): Date | undefined {
  return iso ? new Date(iso) : undefined;
}

function triggerNutritionAdaptation(userId: string): void {
  void nutritionAdaptationService.analyzeAndAdapt(userId).catch((error: unknown) => {
    logger.warn({ err: error, userId }, "Nutrition adaptation after weight mutation failed");
  });
}

export const weightEntryService = {
  async get(userId: string, id: string): Promise<WeightLog> {
    const log = await trackingRepository.getWeightLogForUser(id, userId);
    if (!log) throw ApiError.notFound("Weight log not found.");
    return log;
  },

  async update(userId: string, id: string, input: UpdateWeightLogInput): Promise<WeightLog> {
    const result = await trackingRepository.updateWeightLogForUser(id, userId, {
      weightKg: input.weightKg,
      note: input.note,
      loggedAt: toDate(input.loggedAt),
    });

    if (result.status === "NOT_FOUND") throw ApiError.notFound("Weight log not found.");
    if (result.status === "BASELINE_IMMUTABLE") {
      throw ApiError.conflict("Starting weight baseline cannot be edited.", {
        code: "WEIGHT_BASELINE_IMMUTABLE",
      });
    }

    triggerNutritionAdaptation(userId);
    return result.log;
  },

  async delete(userId: string, id: string): Promise<void> {
    const result = await trackingRepository.deleteWeightLogForUser(id, userId);
    if (result.status === "NOT_FOUND") throw ApiError.notFound("Weight log not found.");
    if (result.status === "BASELINE_IMMUTABLE") {
      throw ApiError.conflict("Starting weight baseline cannot be deleted.", {
        code: "WEIGHT_BASELINE_IMMUTABLE",
      });
    }
    if (result.status === "LAST_ENTRY") {
      throw ApiError.conflict("The only remaining weight entry cannot be deleted.", {
        code: "WEIGHT_LAST_ENTRY_REQUIRED",
      });
    }

    triggerNutritionAdaptation(userId);
  },
};
