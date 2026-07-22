import type { Gender, UserProfile } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { calculateCalories } from "../nutrition-plan/calculations/calorie-calculator";
import { calculateMacros } from "../nutrition-plan/calculations/macro-calculator";
import type { CalculationGender, NutritionProfile } from "../nutrition-plan/types";
import { trackingRepository } from "../tracking/tracking.repository";
import { aiMemoryService } from "./ai-memory.service";
import { daysAgo } from "./metrics";
import type { NutritionAdaptationResult } from "./types";

/** Re-adapt when the calorie target drifts by at least this fraction. */
const CALORIE_DRIFT_RATIO = 0.05;
/** ...or by at least this absolute number of kcal. */
const CALORIE_DRIFT_ABS = 100;
/** Re-adapt when protein target drifts by at least this many grams. */
const PROTEIN_DRIFT_G = 10;

/** Whole years between a date of birth and now. */
function ageFrom(dateOfBirth: Date): number {
  const diffMs = Date.now() - dateOfBirth.getTime();
  return Math.max(0, Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000)));
}

/** Maps the Prisma Gender enum to the calculator's gender space. */
function toCalcGender(gender: Gender): CalculationGender {
  if (gender === "MALE") return "MALE";
  if (gender === "FEMALE") return "FEMALE";
  return "NEUTRAL";
}

/**
 * Builds a calculator NutritionProfile from the stored profile, overriding the
 * current weight with the most recent measured value when available.
 */
function toNutritionProfile(profile: UserProfile, currentWeightKg: number): NutritionProfile {
  return {
    ageYears: ageFrom(profile.dateOfBirth),
    gender: toCalcGender(profile.gender),
    heightCm: profile.heightCm,
    currentWeightKg,
    targetWeightKg: profile.targetWeightKg,
    activityLevel: profile.activityLevel,
    dietaryPreference: profile.dietaryPreference,
    healthConditions: profile.healthConditions,
    allergies: profile.allergies,
    dailyWaterGoalMl: profile.dailyWaterGoalMl,
  };
}

/**
 * Dynamic Nutrition Adaptation service (Sprint 19, Section 4).
 *
 * Recomputes deterministic calorie/macro targets from the user's *current*
 * metrics (latest measured weight, profile, health conditions) and compares
 * them to the active plan. When the drift is material, it reports an adaptation
 * with concrete macro changes and records the reason in AI memory. It never
 * mutates the immutable stored plan — regeneration remains the plan engine's
 * job; this service surfaces *what should change and why*.
 */
export const nutritionAdaptationService = {
  async analyzeAndAdapt(userId: string): Promise<NutritionAdaptationResult> {
    const [profile, activePlan, recentWeights] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.nutritionPlan.findFirst({
        where: { userId, isActive: true },
        orderBy: { updatedAt: "desc" },
      }),
      trackingRepository.listWeightLogs(userId, daysAgo(60)),
    ]);

    if (!profile) {
      return { adapted: false, reason: "Profil bulunamadı.", changes: null };
    }
    if (!activePlan) {
      return {
        adapted: false,
        reason: "Aktif beslenme planı yok; uyarlama için önce plan oluşturulmalı.",
        changes: null,
      };
    }

    const measuredWeight = recentWeights[0]?.weightKg ?? profile.currentWeightKg;
    const np = toNutritionProfile(profile, measuredWeight);
    const calories = calculateCalories(np);
    const macros = calculateMacros(np, calories.dailyCalories, calories.goal);

    const calorieDelta = Math.abs(calories.dailyCalories - activePlan.dailyCalories);
    const proteinDelta = Math.abs(macros.proteinGrams - activePlan.proteinGrams);
    const calorieThreshold = Math.max(
      CALORIE_DRIFT_ABS,
      activePlan.dailyCalories * CALORIE_DRIFT_RATIO,
    );

    const adapted = calorieDelta >= calorieThreshold || proteinDelta >= PROTEIN_DRIFT_G;

    if (!adapted) {
      return {
        adapted: false,
        reason: "Mevcut metrikler plandaki hedeflerle uyumlu; uyarlama gerekmiyor.",
        changes: null,
      };
    }

    const reasonParts: string[] = [];
    if (Math.abs(measuredWeight - profile.currentWeightKg) >= 0.5) {
      reasonParts.push(
        `güncel ölçülen kilo ${measuredWeight} kg (profildeki ${profile.currentWeightKg} kg'dan farklı)`,
      );
    }
    reasonParts.push(
      `hesaplanan günlük kalori ${calories.dailyCalories} kcal, plandaki ${Math.round(activePlan.dailyCalories)} kcal ile ${calorieDelta} kcal fark`,
    );
    if (proteinDelta >= PROTEIN_DRIFT_G) {
      reasonParts.push(`protein hedefi ${activePlan.proteinGrams}g → ${macros.proteinGrams}g`);
    }
    const reason = `Metriklerdeki değişim nedeniyle hedefler güncellendi: ${reasonParts.join("; ")}.`;

    const changes = {
      calories: calories.dailyCalories,
      protein: macros.proteinGrams,
      carbs: macros.carbsGrams,
      fat: macros.fatGrams,
    };

    // Record the adjustment reason in AI memory (GOALS type, append) so future
    // coaching references it and does not repeat the same recommendation.
    try {
      await aiMemoryService.upsertMemory(
        userId,
        "GOALS",
        {
          kind: "nutrition_adaptation",
          reason,
          changes,
          previous: {
            calories: Math.round(activePlan.dailyCalories),
            protein: activePlan.proteinGrams,
            carbs: activePlan.carbsGrams,
            fat: activePlan.fatGrams,
          },
          at: new Date().toISOString(),
        },
        { append: true },
      );
    } catch (error) {
      logger.warn({ err: error, userId }, "Failed to record nutrition adaptation memory");
    }

    return { adapted: true, reason, changes };
  },

  /**
   * Returns the most recent adaptation record for the user (from AI memory),
   * or a neutral "no adaptation yet" result. Used by the GET endpoint.
   */
  async getLatestAdaptation(userId: string): Promise<NutritionAdaptationResult & { at?: string }> {
    const memories = await aiMemoryService.getRelevantMemory(userId, {
      types: ["GOALS"],
      limit: 20,
    });
    const record = memories.find((m) => m.content.kind === "nutrition_adaptation");
    if (!record) {
      return { adapted: false, reason: "Henüz bir beslenme uyarlaması yapılmadı.", changes: null };
    }
    const content = record.content as {
      reason?: string;
      changes?: NutritionAdaptationResult["changes"];
      at?: string;
    };
    return {
      adapted: true,
      reason: content.reason ?? "",
      changes: content.changes ?? null,
      at: content.at,
    };
  },
};
