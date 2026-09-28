import { expect, test } from "@playwright/test";

import {
  monthlyReviewLockedInsight,
  monthlyReviewToInsight,
  weeklyReviewToInsight,
} from "../src/application/health/review-insights";

test("weekly persisted review is presented as a coach summary, not a duplicate History evaluation", () => {
  const insight = weeklyReviewToInsight({
    id: "weekly-1",
    weekNumber: 40,
    year: 2026,
    score: 81,
    weightTrend: "IMPROVING",
    mealConsistency: 80,
    waterConsistency: 70,
    proteinConsistency: 75,
    coachComments: "Kaydettiğin verilere göre haftalık düzenin istikrarlı görünüyor.",
    recommendations: ["Öğün kayıt düzenini sürdür."],
    nextWeekPriorities: ["Su kayıtlarını daha düzenli tut."],
    createdAt: "2026-09-28T12:00:00.000Z",
  });

  expect(insight.title).toBe("Haftalık Koç Özeti");
  expect(insight.summary).toContain("Kaydettiğin verilere göre");
  expect(insight.actionHref).toBe("/history");
  expect(insight.title).not.toMatch(/AI|Yapay Zeka/i);
});

test("free weekly review keeps backend simplified entitlement semantics", () => {
  const insight = weeklyReviewToInsight({
    weekNumber: 40,
    year: 2026,
    score: 72,
    weightTrend: "STABLE",
    topRecommendations: ["Öğün kayıt düzenini koru."],
    premiumLocked: true,
  });

  expect(insight.premium).toBe(true);
  expect(insight.summary).toContain("72/100");
  expect(insight.details.join(" ")).toContain("Premium");
});

test("monthly persisted review is summarized without inventing extra metrics", () => {
  const insight = monthlyReviewToInsight({
    id: "monthly-1",
    month: 9,
    year: 2026,
    progressSummary: "Eylül ayında kayıtlı verilerine göre ilerleme özeti hazırlandı.",
    habitsAnalysis: "Öğün kayıt düzenin istikrarlı.",
    improvements: ["Su takibinde tutarlısın."],
    riskAreas: [],
    aiEvaluation: "Teknik alan kullanıcı başlığı olarak gösterilmez.",
    motivationMessage: "Devam et.",
    priorities: ["Öğün düzenini sürdür."],
    createdAt: "2026-09-28T12:00:00.000Z",
  });

  expect(insight.title).toBe("Aylık Koç Özeti");
  expect(insight.summary).toBe("Eylül ayında kayıtlı verilerine göre ilerleme özeti hazırlandı.");
  expect(insight.details).toContain("Öğün kayıt düzenin istikrarlı.");
  expect(insight.details.join(" ")).not.toContain("Teknik alan");
  expect(insight.actionHref).toBe("/history");
});

test("free monthly access reuses the existing premium contract and keeps History available", () => {
  const insight = monthlyReviewLockedInsight();
  expect(insight.premium).toBe(true);
  expect(insight.summary).toContain("Premium");
  expect(insight.details.join(" ")).toContain("Geçmişim");
  expect(insight.actionHref).toBe("/profile/subscription");
});
