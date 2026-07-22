import type { MonthlyReview } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { trackingRepository } from "../tracking/tracking.repository";
import { aiMemoryService } from "./ai-memory.service";
import { deriveWeight } from "./coach-data";
import { groupBy, monthRange, sum, turkeyDayKey } from "./metrics";
import { riskDetectionService } from "./risk-detection.service";

/**
 * Monthly Review service (Sprint 19, Section 7).
 *
 * Produces a richer monthly coaching summary: overall progress, habits
 * analysis, improvements, risk areas, an AI evaluation, a motivational message
 * and next-month priorities. This is a PREMIUM-only surface — the gate is
 * enforced at the route layer (HTTP 402 for free users). Coaching only, never
 * medical diagnosis. Reviews are idempotent per (user, month, year).
 */
export const monthlyReviewService = {
  /**
   * Generates (or regenerates) and upserts the monthly review for a user. `month`
   * is 1-12; defaults to the current calendar month.
   */
  async generateMonthlyReview(
    userId: string,
    month?: number,
    year?: number,
  ): Promise<MonthlyReview> {
    const now = new Date();
    const m = month ?? now.getUTCMonth() + 1;
    const y = year ?? now.getUTCFullYear();
    const { start, end } = monthRange(m, y);

    const [profile, weightLogs, mealLogs, waterLogs, risks] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      trackingRepository.listWeightLogs(userId, start),
      trackingRepository.listMealLogs(userId, start),
      trackingRepository.listWaterLogs(userId, start),
      riskDetectionService.detectRisks(userId).catch(() => []),
    ]);

    const inMonth = <T extends { loggedAt: Date }>(rows: T[]): T[] =>
      rows.filter((r) => r.loggedAt >= start && r.loggedAt < end);
    const monthWeights = inMonth(weightLogs);
    const monthMeals = inMonth(mealLogs);
    const monthWaters = inMonth(waterLogs);

    // --- Signals ---
    const weight = deriveWeight(monthWeights, profile);
    const mealDays = groupBy(monthMeals, (r) => turkeyDayKey(r.loggedAt)).size;
    const waterDays = groupBy(monthWaters, (r) => turkeyDayKey(r.loggedAt)).size;
    const totalLogs = monthWeights.length + monthMeals.length + monthWaters.length;

    const monthNameTr = MONTH_NAMES_TR[m - 1] ?? `${m}. ay`;

    // --- Progress summary ---
    const trendTr =
      weight.trend === "IMPROVING"
        ? "hedefin yönünde olumlu"
        : weight.trend === "DECLINING"
          ? "hedefinin tersine"
          : "sabit";
    const deltaStr =
      weight.deltaKg !== null
        ? `${weight.deltaKg > 0 ? "+" : ""}${weight.deltaKg.toFixed(1)} kg`
        : "yeterli veri yok";
    const progressSummary =
      `${monthNameTr} ayında kilo eğilimin ${trendTr} ilerledi (net değişim: ${deltaStr}). ` +
      `Bu ay ${mealDays} gün öğün, ${waterDays} gün su kaydı tuttun ve toplam ${totalLogs} kayıt oluşturdun.`;

    // --- Habits analysis ---
    const breakfastDays = new Set(
      monthMeals.filter((m2) => m2.mealType === "BREAKFAST").map((m2) => turkeyDayKey(m2.loggedAt)),
    ).size;
    const skipsBreakfast = mealDays >= 5 && breakfastDays / Math.max(1, mealDays) < 0.4;
    const avgWaterMl =
      monthWaters.length > 0
        ? Math.round(sum(monthWaters.map((w) => w.amountMl)) / Math.max(1, waterDays))
        : 0;
    const habitsAnalysis =
      `Kayıt düzenin ${mealDays >= 20 ? "oldukça istikrarlı" : mealDays >= 10 ? "orta düzeyde" : "gelişmeye açık"}. ` +
      (skipsBreakfast
        ? "Bu ay sık sık kahvaltıyı atladığın görülüyor; güne dengeli bir kahvaltıyla başlamak enerjine katkı sağlar. "
        : "Öğün dağılımın genel olarak dengeli görünüyor. ") +
      (avgWaterMl > 0 ? `Kayıtlı günlerde ortalama günlük su alımın ~${avgWaterMl} ml.` : "");

    // --- Improvements & risk areas ---
    const improvements: string[] = [];
    if (weight.trend === "IMPROVING") improvements.push("Kilo eğilimin hedefin yönünde ilerliyor.");
    if (mealDays >= 20) improvements.push("Öğün kaydı alışkanlığın çok güçlü.");
    if (waterDays >= 20) improvements.push("Su takibinde tutarlısın.");
    if (improvements.length === 0) {
      improvements.push("Bu ay attığın her kayıt, gelişimin için değerli bir adım.");
    }

    const riskAreas: string[] = risks.slice(0, 5).map((r) => `${r.message} ${r.recommendation}`);
    if (riskAreas.length === 0) {
      riskAreas.push("Bu ay belirgin bir risk sinyali tespit edilmedi. Böyle devam!");
    }

    // --- AI evaluation & motivation (deterministic, Turkish, coaching tone) ---
    const aiEvaluation =
      `Genel olarak ${monthNameTr} ayı ${weight.trend === "IMPROVING" ? "verimli" : weight.trend === "DECLINING" ? "zorlu ama öğretici" : "istikrarlı"} bir ay oldu. ` +
      "Sağlıklı yaşam bir maraton; kısa vadeli dalgalanmalar yerine uzun vadeli tutarlılık önemli. " +
      "Verilerine dayanarak, küçük ve sürdürülebilir ayarlamalarla ilerlemeni hızlandırabiliriz.";
    const motivationMessage =
      weight.trend === "DECLINING"
        ? "Zorlu geçen bir ay, başarısızlık değil bir dönüm noktasıdır. Yeni ay, yeni bir başlangıç — yanındayım!"
        : "Harika gidiyorsun! Attığın adımlar birikiyor ve seni hedefine yaklaştırıyor. Bu ivmeyi koru!";

    // --- Next-month priorities ---
    const priorities: string[] = [];
    if (skipsBreakfast) priorities.push("Düzenli kahvaltı alışkanlığı edin.");
    if (mealDays < 20) priorities.push("Günlük öğün kaydını daha tutarlı hale getir.");
    if (avgWaterMl > 0 && profile && avgWaterMl < profile.dailyWaterGoalMl)
      priorities.push("Günlük su hedefine daha çok gün ulaş.");
    if (weight.trend === "DECLINING")
      priorities.push("Porsiyon ve öğün sıklığını gözden geçirerek eğilimi hedefe çevir.");
    if (priorities.length === 0) priorities.push("Mevcut sağlıklı düzenini sürdür.");

    const review = await prisma.monthlyReview.upsert({
      where: { userId_month_year: { userId, month: m, year: y } },
      create: {
        userId,
        month: m,
        year: y,
        progressSummary,
        habitsAnalysis,
        improvements,
        riskAreas,
        aiEvaluation,
        motivationMessage,
        priorities,
      },
      update: {
        progressSummary,
        habitsAnalysis,
        improvements,
        riskAreas,
        aiEvaluation,
        motivationMessage,
        priorities,
      },
    });

    await aiMemoryService
      .upsertMemory(userId, "ACHIEVEMENTS", {
        kind: "monthly_review",
        month: m,
        year: y,
        label: `${y} yılı ${monthNameTr} ayı değerlendirmesi tamamlandı.`,
      })
      .catch((error: unknown) => {
        logger.warn({ err: error, userId }, "Monthly review memory write failed");
      });

    return review;
  },

  /** Reads the stored monthly review for a user/month, or null. */
  getMonthlyReview(userId: string, month: number, year: number): Promise<MonthlyReview | null> {
    return prisma.monthlyReview.findUnique({
      where: { userId_month_year: { userId, month, year } },
    });
  },

  /** Returns the most recent stored monthly review for a user, or null. */
  getLatestMonthlyReview(userId: string): Promise<MonthlyReview | null> {
    return prisma.monthlyReview.findFirst({
      where: { userId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
  },
};

/** Turkish month names, index 0 = January. */
const MONTH_NAMES_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
