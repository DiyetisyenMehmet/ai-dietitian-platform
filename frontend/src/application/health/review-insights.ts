import type { AiInsight } from "@/domain/health/types";
import type {
  MonthlyReviewDto,
  WeeklyReviewDto,
  WeeklyReviewFullDto,
} from "@/infrastructure/ai-coach/coach-reviews-client";

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isFullWeekly(review: WeeklyReviewDto): review is WeeklyReviewFullDto {
  return !("premiumLocked" in review);
}

function weightTrendLabel(value: WeeklyReviewDto["weightTrend"]): string {
  if (value === "IMPROVING") return "hedefin yönünde";
  if (value === "DECLINING") return "hedefinin tersine";
  return "sabit";
}

export function weeklyReviewToInsight(review: WeeklyReviewDto): AiInsight {
  if (!isFullWeekly(review)) {
    return {
      id: `weekly-review-${review.year}-${review.weekNumber}`,
      kind: "weekly-review",
      title: "Haftalık Koç Özeti",
      summary: `Haftalık kayıt puanın ${review.score}/100; kilo eğilimin ${weightTrendLabel(review.weightTrend)}.`,
      details: [
        ...review.topRecommendations.slice(0, 2),
        "Daha ayrıntılı koçluk özeti Premium erişimde sunulur.",
      ],
      severity: "info",
      icon: "calendar",
      premium: true,
      actionLabel: "Geçmişim'i aç",
      actionHref: "/history",
    };
  }

  const recommendations = stringList(review.recommendations);
  const priorities = stringList(review.nextWeekPriorities);
  return {
    id: `weekly-review-${review.year}-${review.weekNumber}`,
    kind: "weekly-review",
    title: "Haftalık Koç Özeti",
    summary: review.coachComments,
    details: [
      ...recommendations.slice(0, 2),
      ...priorities.slice(0, 2).map((item) => `Öncelik: ${item}`),
    ].slice(0, 4),
    severity: "info",
    icon: "calendar",
    actionLabel: "Geçmişim'i aç",
    actionHref: "/history",
  };
}

export function monthlyReviewToInsight(review: MonthlyReviewDto): AiInsight {
  const improvements = stringList(review.improvements);
  const priorities = stringList(review.priorities);
  return {
    id: `monthly-review-${review.year}-${review.month}`,
    kind: "monthly-review",
    title: "Aylık Koç Özeti",
    summary: review.progressSummary,
    details: [
      review.habitsAnalysis,
      ...improvements.slice(0, 1),
      ...priorities.slice(0, 2).map((item) => `Öncelik: ${item}`),
    ].filter(Boolean).slice(0, 4),
    severity: "info",
    icon: "trending-up",
    actionLabel: "Geçmişim'i aç",
    actionHref: "/history",
  };
}

export function weeklyReviewUnavailableInsight(): AiInsight {
  return {
    id: "weekly-review-unavailable",
    kind: "weekly-review",
    title: "Haftalık Koç Özeti",
    summary: "Haftalık koç özeti şu anda alınamıyor. Geçmişim değerlendirmelerin kullanılmaya devam ediyor.",
    details: [],
    severity: "info",
    icon: "calendar",
    actionLabel: "Geçmişim'i aç",
    actionHref: "/history",
  };
}

export function monthlyReviewLockedInsight(): AiInsight {
  return {
    id: "monthly-review-locked",
    kind: "monthly-review",
    title: "Aylık Koç Özeti",
    summary: "Aylık koç özeti Premium erişim kapsamında sunulur.",
    details: ["Aylık Geçmişim değerlendirmesi mevcut kayıtlarınla kullanılmaya devam eder."],
    severity: "info",
    icon: "trending-up",
    premium: true,
    actionLabel: "Aboneliği gör",
    actionHref: "/profile/subscription",
  };
}

export function monthlyReviewUnavailableInsight(): AiInsight {
  return {
    id: "monthly-review-unavailable",
    kind: "monthly-review",
    title: "Aylık Koç Özeti",
    summary: "Aylık koç özeti şu anda alınamıyor. Aylık Geçmişim değerlendirmesi kullanılmaya devam ediyor.",
    details: [],
    severity: "info",
    icon: "trending-up",
    actionLabel: "Geçmişim'i aç",
    actionHref: "/history",
  };
}
