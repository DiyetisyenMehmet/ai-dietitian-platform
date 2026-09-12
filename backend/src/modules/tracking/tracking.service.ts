import type { MealLog, WaterLog, WeightLog } from "@prisma/client";

import { logger } from "../../lib/logger";
import { ApiError } from "../../utils/api-error";
import { nutritionAdaptationService } from "../ai-coach/nutrition-adaptation.service";
import { getAIAdapter } from "../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { notificationService } from "../notifications/notification.service";
import { trackingRepository } from "./tracking.repository";
import type {
  CreateMealLogInput,
  CreateWaterLogInput,
  CreateWeightLogInput,
  ScheduleWaterReminderInput,
  UpdateMealLogInput,
  UpdateWaterGoalInput,
} from "./tracking.schemas";
import {
  buildWeightCheckInStatus,
  type WeightCheckInStatus,
} from "./weight-check-in";

export const WEIGHT_CHECK_IN_REQUIRED_CODE = "WEIGHT_CHECK_IN_REQUIRED";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface WaterRecommendation {
  text: string;
  source: "AI" | "RULE_BASED_FALLBACK";
  todayMl: number;
  dailyGoalMl: number;
  sevenDayAverageMl: number;
  generatedAt: string;
}

/** Parses an optional ISO string into a Date, or undefined. */
function toDate(iso?: string): Date | undefined {
  return iso ? new Date(iso) : undefined;
}

function fallbackHydrationText(todayMl: number, goalMl: number, sevenDayAverageMl: number): string {
  if (goalMl <= 0) {
    return "Kişisel hidrasyon değerlendirmesi için önce günlük su hedefini belirle.";
  }
  const ratio = todayMl / goalMl;
  if (ratio < 0.6) {
    return `Bugünkü su tüketimin hedefinin yaklaşık %${Math.round(ratio * 100)} seviyesinde. Günün kalanına küçük porsiyonlar halinde su eklemek, tek seferde çok miktar içmekten daha sürdürülebilir olabilir. Son 7 günlük ortalaman ${sevenDayAverageMl} ml.`;
  }
  if (ratio < 1) {
    return `Günlük su hedefine yaklaşıyorsun. Kalan yaklaşık ${Math.max(0, goalMl - todayMl)} ml'yi gün içine yayarak tamamlayabilirsin. Son 7 günlük ortalaman ${sevenDayAverageMl} ml.`;
  }
  return `Bugünkü su hedefini karşıladın. Susama, aktivite ve hava koşullarını izlemeye devam et; gereksiz şekilde hedefin çok üzerine çıkmaya çalışma. Son 7 günlük ortalaman ${sevenDayAverageMl} ml.`;
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

    void nutritionAdaptationService.analyzeAndAdapt(userId).catch((error: unknown) => {
      logger.warn({ err: error, userId }, "Nutrition adaptation after weight log failed");
    });

    return log;
  },

  listWeight(userId: string, since?: Date): Promise<WeightLog[]> {
    return trackingRepository.listWeightLogs(userId, since);
  },

  async getWeightCheckInStatus(userId: string, now = new Date()): Promise<WeightCheckInStatus> {
    const context = await trackingRepository.getWeightCheckInContext(userId);
    if (!context) {
      throw ApiError.notFound("User not found.");
    }
    return buildWeightCheckInStatus(
      context.onboardingCompleted,
      context.lastWeightLog?.loggedAt ?? null,
      now,
    );
  },

  async requireCurrentWeightCheckIn(userId: string): Promise<void> {
    const status = await this.getWeightCheckInStatus(userId);
    if (!status.required) return;
    throw new ApiError(409, "Weekly weight check-in is required before recalculating a nutrition plan.", {
      code: WEIGHT_CHECK_IN_REQUIRED_CODE,
      details: status,
    });
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

  async updateMeal(userId: string, id: string, input: UpdateMealLogInput): Promise<MealLog> {
    const updated = await trackingRepository.updateMealLogForUser(id, userId, input);
    if (!updated) {
      throw ApiError.notFound("Meal log not found.");
    }
    return updated;
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

  async deleteWater(userId: string, id: string): Promise<void> {
    const deleted = await trackingRepository.deleteWaterLogForUser(id, userId);
    if (deleted.count === 0) {
      throw ApiError.notFound("Water log not found.");
    }
  },

  async getWaterGoal(userId: string): Promise<number> {
    const profile = await trackingRepository.getWaterProfile(userId);
    if (!profile) throw ApiError.notFound("Health profile not found.");
    return profile.dailyWaterGoalMl;
  },

  async updateWaterGoal(userId: string, input: UpdateWaterGoalInput): Promise<number> {
    const profile = await trackingRepository.updateWaterGoalForUser(userId, input.dailyWaterGoalMl);
    if (!profile) throw ApiError.notFound("Health profile not found.");
    return profile.dailyWaterGoalMl;
  },

  async scheduleWaterReminder(userId: string, input: ScheduleWaterReminderInput) {
    const scheduledFor = new Date(Date.now() + input.minutesFromNow * 60_000);
    return notificationService.scheduleNotification(
      userId,
      "WATER_REMINDER",
      "Su zamanı",
      "Günlük su hedefini hatırla. Küçük bir bardak su iyi bir sonraki adım olabilir.",
      scheduledFor,
      { source: "water-tracking", minutesFromNow: input.minutesFromNow },
    );
  },

  async getWaterRecommendation(userId: string): Promise<WaterRecommendation> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    const twentyFourHoursAgo = new Date(now.getTime() - DAY_MS);
    const [profile, logs] = await Promise.all([
      trackingRepository.getWaterProfile(userId),
      trackingRepository.listWaterLogs(userId, sevenDaysAgo),
    ]);
    if (!profile) throw ApiError.notFound("Health profile not found.");

    const sevenDayTotal = logs.reduce((sum, log) => sum + log.amountMl, 0);
    const todayMl = logs
      .filter((log) => log.loggedAt >= twentyFourHoursAgo)
      .reduce((sum, log) => sum + log.amountMl, 0);
    const sevenDayAverageMl = Math.round(sevenDayTotal / 7);
    const fallback = fallbackHydrationText(todayMl, profile.dailyWaterGoalMl, sevenDayAverageMl);
    const generatedAt = now.toISOString();

    try {
      const adapter = getAIAdapter();
      const output = await adapter.chatWithDietitian({
        context: {
          recentTracking: {
            windowHours: 168,
            mealCount: 0,
            waterMl: sevenDayTotal,
          },
        },
        history: [],
        message: [
          "Yalnızca hidrasyon alışkanlığı hakkında kısa, kişisel ve güvenli bir öneri ver.",
          `Günlük hedef: ${profile.dailyWaterGoalMl} ml.`,
          `Son 24 saat: ${todayMl} ml.`,
          `Son 7 gün günlük ortalama: ${sevenDayAverageMl} ml.`,
          `Aktivite seviyesi: ${profile.activityLevel}.`,
          "Tanı, tedavi veya kesin tıbbi iddia yapma. 2-3 kısa uygulanabilir öneri yeterli.",
        ].join(" "),
      });
      const text = output.reply.trim();
      if (text) {
        return {
          text: text.slice(0, 1400),
          source: "AI",
          todayMl,
          dailyGoalMl: profile.dailyWaterGoalMl,
          sevenDayAverageMl,
          generatedAt,
        };
      }
    } catch (error) {
      logger.warn({ err: error, userId }, "AI hydration recommendation unavailable; using fallback");
    }

    return {
      text: fallback,
      source: "RULE_BASED_FALLBACK",
      todayMl,
      dailyGoalMl: profile.dailyWaterGoalMl,
      sevenDayAverageMl,
      generatedAt,
    };
  },
};
