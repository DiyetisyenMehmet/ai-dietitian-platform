import type { WeeklyReview, WeightTrend } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { trackingRepository } from "../tracking/tracking.repository";
import { aiMemoryService } from "./ai-memory.service";
import { deriveWeight } from "./coach-data";
import { getIsoWeek, groupBy, isoWeekRange, sum, toScore, turkeyDayKey } from "./metrics";

/** A simplified weekly review returned to free-tier users. */
export interface SimplifiedWeeklyReview {
  weekNumber: number;
  year: number;
  score: number;
  weightTrend: WeightTrend;
  topRecommendations: string[];
  premiumLocked: true;
}

/**
 * Weekly Review service (Sprint 19, Section 6).
 *
 * Produces a data-driven weekly coaching report: an overall 0-100 score, the
 * weight trend, meal/water/protein consistency percentages, Turkish coach
 * comments, recommendations and next-week priorities. Reviews are idempotent
 * per (user, ISO week, year). Free-tier users receive a simplified view
 * (score + weight trend + top-2 recommendations); premium users get the full
 * report. Coaching only — never diagnosis.
 */
export const weeklyReviewService = {
  /**
   * Generates (or regenerates) and upserts the weekly review for a user and ISO
   * week. Defaults to the current ISO week when not specified.
   */
  async generateWeeklyReview(
    userId: string,
    weekNumber?: number,
    year?: number,
  ): Promise<WeeklyReview> {
    const iso = weekNumber && year ? { weekNumber, year } : getIsoWeek();
    const { start, end } = isoWeekRange(iso.weekNumber, iso.year);

    const [profile, weightLogs, mealLogs, waterLogs] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      trackingRepository.listWeightLogs(userId, start),
      trackingRepository.listMealLogs(userId, start),
      trackingRepository.listWaterLogs(userId, start),
    ]);

    // Bound logs to the week window [start, end).
    const inWeek = <T extends { loggedAt: Date }>(rows: T[]): T[] =>
      rows.filter((r) => r.loggedAt >= start && r.loggedAt < end);
    const weekWeights = inWeek(weightLogs);
    const weekMeals = inWeek(mealLogs);
    const weekWaters = inWeek(waterLogs);

    // --- Consistency metrics (0-100) ---
    // Meal consistency: fraction of the 7 days with 3+ meals logged.
    const mealsByDay = groupBy(weekMeals, (m) => turkeyDayKey(m.loggedAt));
    let daysWith3 = 0;
    for (const meals of mealsByDay.values()) {
      if (meals.length >= 3) daysWith3 += 1;
    }
    const mealConsistency = toScore((daysWith3 / 7) * 100);

    // Water consistency: fraction of the 7 days meeting the daily goal.
    const waterGoal = profile?.dailyWaterGoalMl ?? 0;
    const watersByDay = groupBy(weekWaters, (w) => turkeyDayKey(w.loggedAt));
    let daysMetWater = 0;
    if (waterGoal > 0) {
      for (const logs of watersByDay.values()) {
        if (sum(logs.map((w) => w.amountMl)) >= waterGoal) daysMetWater += 1;
      }
    }
    const waterConsistency = waterGoal > 0 ? toScore((daysMetWater / 7) * 100) : 0;

    // Protein consistency: days meeting the protein target (0.8 g/kg body weight).
    const bodyWeightKg = weekWeights[0]?.weightKg ?? profile?.currentWeightKg ?? null;
    let proteinConsistency = 0;
    if (bodyWeightKg) {
      const proteinTarget = 0.8 * bodyWeightKg;
      let daysMetProtein = 0;
      for (const meals of mealsByDay.values()) {
        const dayProtein = sum(meals.map((m) => m.proteinG ?? 0));
        if (dayProtein >= proteinTarget) daysMetProtein += 1;
      }
      proteinConsistency = toScore((daysMetProtein / 7) * 100);
    }

    // --- Weight trend ---
    const weight = deriveWeight(weekWeights, profile);
    const weightTrend: WeightTrend = weight.trend;

    // --- Overall score (weighted blend of the consistency signals) ---
    const trendBonus = weightTrend === "IMPROVING" ? 10 : weightTrend === "DECLINING" ? -10 : 0;
    const score = toScore(
      mealConsistency * 0.4 +
        waterConsistency * 0.25 +
        proteinConsistency * 0.25 +
        50 * 0.1 +
        trendBonus,
    );

    // --- Turkish coach comments, recommendations, next-week priorities ---
    const { coachComments, recommendations, nextWeekPriorities } = this.buildNarrative({
      score,
      weightTrend,
      mealConsistency,
      waterConsistency,
      proteinConsistency,
      loggedDays: mealsByDay.size,
    });

    const review = await prisma.weeklyReview.upsert({
      where: { userId_weekNumber_year: { userId, weekNumber: iso.weekNumber, year: iso.year } },
      create: {
        userId,
        weekNumber: iso.weekNumber,
        year: iso.year,
        score,
        weightTrend,
        mealConsistency,
        waterConsistency,
        proteinConsistency,
        coachComments,
        recommendations,
        nextWeekPriorities,
      },
      update: {
        score,
        weightTrend,
        mealConsistency,
        waterConsistency,
        proteinConsistency,
        coachComments,
        recommendations,
        nextWeekPriorities,
      },
    });

    // Record a compact conversation-summary-style memory so future coaching can
    // reference the week. Best-effort.
    await aiMemoryService
      .upsertMemory(userId, "ACHIEVEMENTS", {
        kind: "weekly_review",
        weekNumber: iso.weekNumber,
        year: iso.year,
        score,
        label: `${iso.year} yılı ${iso.weekNumber}. hafta değerlendirmesi: ${score}/100.`,
      })
      .catch((error: unknown) => {
        logger.warn({ err: error, userId }, "Weekly review memory write failed");
      });

    return review;
  },

  /** Builds the Turkish narrative fields from the computed metrics. */
  buildNarrative(input: {
    score: number;
    weightTrend: WeightTrend;
    mealConsistency: number;
    waterConsistency: number;
    proteinConsistency: number;
    loggedDays: number;
  }): { coachComments: string; recommendations: string[]; nextWeekPriorities: string[] } {
    const {
      score,
      weightTrend,
      mealConsistency,
      waterConsistency,
      proteinConsistency,
      loggedDays,
    } = input;

    const trendTr =
      weightTrend === "IMPROVING"
        ? "hedefin yönünde olumlu"
        : weightTrend === "DECLINING"
          ? "hedefinin tersine"
          : "sabit";

    let tone: string;
    if (score >= 75) tone = "Harika bir hafta geçirdin!";
    else if (score >= 50) tone = "Bu hafta genel olarak iyi gidiyorsun.";
    else tone = "Bu hafta biraz zorlanmış olabilirsin, ama önemli olan devam etmek.";

    const coachComments =
      `${tone} Genel haftalık puanın ${score}/100. Kilo eğilimin ${trendTr} ilerledi. ` +
      `Öğün tutarlılığın %${mealConsistency}, su tutarlılığın %${waterConsistency}, ` +
      `protein tutarlılığın %${proteinConsistency} oldu. ` +
      (loggedDays >= 5
        ? "Kayıt alışkanlığın çok iyi — bu, koçunun sana daha isabetli öneriler vermesini sağlıyor."
        : "Daha düzenli kayıt tutmak, gelişimini daha net görmemizi sağlar.");

    const recommendations: string[] = [];
    if (mealConsistency < 70) {
      recommendations.push(
        "Her gün en az 3 öğününü kaydetmeyi hedefle; bu, ilerlemenin temelidir.",
      );
    }
    if (waterConsistency < 70) {
      recommendations.push("Günlük su hedefine ulaşmak için yanında bir su şişesi bulundur.");
    }
    if (proteinConsistency < 70) {
      recommendations.push(
        "Öğünlerine yumurta, yoğurt, baklagil veya yağsız et gibi protein kaynakları ekle.",
      );
    }
    if (weightTrend === "DECLINING") {
      recommendations.push(
        "Kilo eğilimini yeniden hedefine çevirmek için porsiyonlarını ve öğün sıklığını gözden geçir.",
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        "Mevcut düzenini koru — çok iyi gidiyorsun. Küçük tutarlılıklar büyük fark yaratır.",
      );
    }

    const nextWeekPriorities: string[] = [];
    if (mealConsistency < proteinConsistency && mealConsistency < waterConsistency) {
      nextWeekPriorities.push("Öğün kaydı tutarlılığını artır.");
    }
    if (waterConsistency <= mealConsistency && waterConsistency < 80) {
      nextWeekPriorities.push("Günlük su hedefine daha çok gün ulaş.");
    }
    if (proteinConsistency < 80) {
      nextWeekPriorities.push("Protein alımını düzenli hale getir.");
    }
    if (nextWeekPriorities.length === 0) {
      nextWeekPriorities.push("Bu haftaki başarılı düzenini sürdür.");
    }

    return { coachComments, recommendations, nextWeekPriorities };
  },

  /** Reads the stored weekly review for a user/week, or null. */
  getWeeklyReview(userId: string, weekNumber: number, year: number): Promise<WeeklyReview | null> {
    return prisma.weeklyReview.findUnique({
      where: { userId_weekNumber_year: { userId, weekNumber, year } },
    });
  },

  /** Returns the most recent stored weekly review for a user, or null. */
  getLatestWeeklyReview(userId: string): Promise<WeeklyReview | null> {
    return prisma.weeklyReview.findFirst({
      where: { userId },
      orderBy: [{ year: "desc" }, { weekNumber: "desc" }],
    });
  },

  /** Projects a full review to the simplified free-tier shape. */
  toSimplified(review: WeeklyReview): SimplifiedWeeklyReview {
    const recs = Array.isArray(review.recommendations)
      ? (review.recommendations as unknown[]).filter((r): r is string => typeof r === "string")
      : [];
    return {
      weekNumber: review.weekNumber,
      year: review.year,
      score: review.score,
      weightTrend: review.weightTrend,
      topRecommendations: recs.slice(0, 2),
      premiumLocked: true,
    };
  },
};
