import type { AiMemory } from "@prisma/client";

import { deriveWeight, loadCoachData } from "./coach-data";
import { average, daysAgo } from "./metrics";
import { MEMORY_WINDOW_DAYS } from "./premium";
import { aiMemoryService } from "./ai-memory.service";
import type { ProgressDeclineResult, SmartQuestionBlock } from "./types";

/**
 * Investigative question categories asked when progress declines. Keys are
 * stable identifiers; questions are the Turkish prompts shown to the user.
 */
export const QUESTION_CATEGORIES: { key: string; question: string }[] = [
  { key: "vacation", question: "Bu hafta tatilde veya seyahatte miydin?" },
  { key: "illness", question: "Kendini hasta ya da halsiz hissettiğin günler oldu mu?" },
  { key: "stress", question: "Son günlerde stres seviyen normalden yüksek miydi?" },
  { key: "poor_sleep", question: "Uyku düzenin bozuldu mu, yeterince uyuyabildin mi?" },
  { key: "eating_outside", question: "Dışarıda yeme sıklığın arttı mı?" },
  { key: "other", question: "Rutinini etkileyen başka bir durum yaşadın mı?" },
];

const VALID_CATEGORY_KEYS = new Set(QUESTION_CATEGORIES.map((c) => c.key));

/**
 * Smart Question Engine (Sprint 19, Section 3).
 *
 * When progress declines (weight moving the wrong way week-over-week, or
 * calories consistently over the plan target), the coach asks investigative
 * questions BEFORE giving advice, then remembers the answers so future guidance
 * adapts. This is coaching, never diagnosis.
 */
export const smartQuestionEngine = {
  /**
   * Detects whether the user's recent progress has declined and, if so, why and
   * which questions to ask. Uses a short 21-day window (enough to compare two
   * recent weeks) regardless of tier.
   */
  async detectProgressDecline(userId: string): Promise<ProgressDeclineResult> {
    const bundle = await loadCoachData(userId, 21);
    const reasons: string[] = [];

    // 1. Weight moving the wrong way week-over-week.
    const weight = deriveWeight(bundle.weightLogs, bundle.profile);
    if (weight.trend === "DECLINING" && weight.weekOverWeekKg !== null) {
      const wowAbs = Math.abs(weight.weekOverWeekKg).toFixed(1);
      reasons.push(`kilo hedefin yönünde ilerlemiyor (haftalık ${wowAbs} kg ters yönde)`);
    }

    // 2. Calories consistently over the active plan's target.
    const target = bundle.activePlan?.dailyCalories ?? null;
    if (target && bundle.mealLogs.length > 0) {
      const byDay = new Map<string, number>();
      for (const meal of bundle.mealLogs) {
        if (meal.loggedAt < daysAgo(7)) continue;
        const key = meal.loggedAt.toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + (meal.calories ?? 0));
      }
      const dailyTotals = [...byDay.values()].filter((v) => v > 0);
      const overDays = dailyTotals.filter((v) => v > target * 1.1).length;
      if (dailyTotals.length >= 3 && overDays / dailyTotals.length >= 0.5) {
        reasons.push(
          `son günlerde kalori alımı hedefin (~${Math.round(target)} kcal) belirgin şekilde üzerinde`,
        );
      } else if (dailyTotals.length > 0 && average(dailyTotals) > target * 1.15) {
        reasons.push("ortalama günlük kalori alımı hedefin üzerinde");
      }
    }

    if (reasons.length === 0) {
      return { declined: false, reason: "", suggestedQuestions: [] };
    }

    return {
      declined: true,
      reason: reasons.join("; "),
      suggestedQuestions: QUESTION_CATEGORIES.map((c) => c.question),
    };
  },

  /** Builds the structured question block object for a decline result. */
  buildQuestionBlock(_decline: ProgressDeclineResult): SmartQuestionBlock {
    return {
      intro:
        "İlerlemende bir yavaşlama fark ettim. Sana en doğru tavsiyeyi verebilmem için " +
        "önce birkaç kısa soru sormak istiyorum:",
      categories: QUESTION_CATEGORIES,
    };
  },

  /** Renders the question block as a Turkish text snippet prepended to a reply. */
  renderQuestionBlock(decline: ProgressDeclineResult): string {
    const block = this.buildQuestionBlock(decline);
    const bullets = block.categories.map((c) => `• ${c.question}`).join("\n");
    return `${block.intro}\n${bullets}`;
  },

  /**
   * Stores the user's answer to an investigative question as a MISTAKES memory
   * (append mode) so future advice adapts. Returns the created memory.
   */
  async recordAnswer(userId: string, category: string, answer: string): Promise<AiMemory> {
    const key = VALID_CATEGORY_KEYS.has(category) ? category : "other";
    const note = `İlerleme yavaşlaması nedeni [${key}]: ${answer}`;
    return aiMemoryService.upsertMemory(
      userId,
      "MISTAKES",
      { category: key, answer, note },
      { append: true, expiresAt: daysAgo(-MEMORY_WINDOW_DAYS.premium) },
    );
  },
};
