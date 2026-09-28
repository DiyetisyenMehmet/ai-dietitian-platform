"use client";

import * as React from "react";

import type { AiInsight } from "@/domain/health/types";
import { coachReviewsClient } from "@/infrastructure/ai-coach/coach-reviews-client";
import { useSubscription } from "@/application/payments/subscription-store";
import {
  monthlyReviewLockedInsight,
  monthlyReviewToInsight,
  monthlyReviewUnavailableInsight,
  weeklyReviewToInsight,
  weeklyReviewUnavailableInsight,
} from "./review-insights";
import { useHealthProfile } from "./health-profile-store";
import { useWeightEntries } from "./weight-store";
import { useProgressStats } from "./progress-analytics";
import { useDailyTracking } from "./daily-tracking-store";
import { useBloodTests } from "./blood-test-store";

/**
 * Surfaces the Sprint 19 "AI intelligence" as user-facing insight cards:
 * weekly review, monthly review (premium), risk alerts, nutrition adaptations,
 * a smart follow-up question and a memory summary.
 *
 * Weekly/monthly review cards reuse the persisted backend review contracts.
 * The remaining coaching cards continue to use their existing client-side
 * session signals. All copy is Turkish, coaching-toned and explicitly framed
 * as guidance — never medical diagnosis.
 */
export function useAiInsights(): AiInsight[] {
  const profile = useHealthProfile();
  const entries = useWeightEntries();
  const stats = useProgressStats(entries, profile.targetWeightKg);
  const tracking = useDailyTracking();
  const bloodTests = useBloodTests();
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const isPremium = subscription.tier !== "FREE";

  const [weeklyReviewInsight, setWeeklyReviewInsight] = React.useState<AiInsight | null>(null);
  const [monthlyReviewInsight, setMonthlyReviewInsight] = React.useState<AiInsight | null>(null);
  const [weeklyReviewLoading, setWeeklyReviewLoading] = React.useState(true);
  const [monthlyReviewLoading, setMonthlyReviewLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setWeeklyReviewLoading(true);
    void coachReviewsClient
      .getWeeklyReview()
      .then(({ review }) => {
        if (active) setWeeklyReviewInsight(weeklyReviewToInsight(review));
      })
      .catch(() => {
        if (active) setWeeklyReviewInsight(weeklyReviewUnavailableInsight());
      })
      .finally(() => {
        if (active) setWeeklyReviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (subscriptionLoading) return;

    if (!isPremium) {
      setMonthlyReviewInsight(monthlyReviewLockedInsight());
      setMonthlyReviewLoading(false);
      return;
    }

    let active = true;
    setMonthlyReviewLoading(true);
    void coachReviewsClient
      .getMonthlyReview()
      .then(({ review }) => {
        if (active) setMonthlyReviewInsight(monthlyReviewToInsight(review));
      })
      .catch(() => {
        if (active) setMonthlyReviewInsight(monthlyReviewUnavailableInsight());
      })
      .finally(() => {
        if (active) setMonthlyReviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isPremium, subscriptionLoading]);

  return React.useMemo(() => {
    const insights: AiInsight[] = [];

    insights.push(
      weeklyReviewLoading
        ? {
            id: "weekly-review-loading",
            kind: "weekly-review",
            title: "Haftalık Koç Özeti",
            summary: "Haftalık koç özeti hazırlanıyor.",
            details: [],
            severity: "info",
            icon: "calendar",
          }
        : weeklyReviewInsight ?? weeklyReviewUnavailableInsight(),
    );

    insights.push(
      monthlyReviewLoading
        ? {
            id: "monthly-review-loading",
            kind: "monthly-review",
            title: "Aylık Koç Özeti",
            summary: "Aylık koç özeti hazırlanıyor.",
            details: [],
            severity: "info",
            icon: "trending-up",
          }
        : monthlyReviewInsight ?? monthlyReviewUnavailableInsight(),
    );

    // 3) Risk alerts — from water intake, weigh-in gaps and blood tests.
    const waterRatio = tracking.waterGoalMl > 0 ? tracking.waterMl / tracking.waterGoalMl : 1;
    if (waterRatio < 0.5) {
      insights.push({
        id: "risk-hydration",
        kind: "risk-alert",
        title: "Su Tüketimi Düşük",
        summary: "Bugün su hedefinin yarısının altındasın.",
        details: [
          "Yetersiz su, yorgunluk ve iştah dalgalanmasına yol açabilir.",
          "Bir sonraki bardağı şimdi içmeyi dene; küçük adımlar fark yaratır.",
        ],
        severity: "warning",
        icon: "droplet",
        actionLabel: "Su ekle",
        actionHref: "/dashboard",
      });
    }
    const flaggedCount = bloodTests.reduce((sum, t) => sum + (t.flaggedCount ?? 0), 0);
    if (flaggedCount > 0) {
      insights.push({
        id: "risk-blood",
        kind: "risk-alert",
        title: "Takip Gerektiren Tahlil Değeri",
        summary: `${flaggedCount} tahlil değerin referans aralığının dışında görünüyor.`,
        details: [
          "Beslenme planını bu değerleri destekleyecek şekilde uyarlayabiliriz.",
          "Bu bir uyarıdır, tanı değildir; değerlendirme için hekimine danışmanı öneririm.",
        ],
        severity: "danger",
        icon: "flask",
        actionLabel: "Tahlilleri gör",
        actionHref: "/profile/blood-tests",
      });
    }

    // 4) Nutrition adaptation.
    insights.push({
      id: "nutrition-adaptation",
      kind: "nutrition-adaptation",
      title: "Beslenme Uyarlaması",
      summary:
        stats.direction === "lose"
          ? "Planını, tokluk hissini artıran lif ve protein odağıyla güncelledim."
          : "Planını, dengeli enerji için kaliteli karbonhidrat ve proteinle güncelledim.",
      details: [
        `Günlük kalori hedefin ${profile.dailyCalorieGoal.toLocaleString("tr-TR")} kcal olarak korunuyor.`,
        "Öğün önerilerin alerji ve tercihlerine göre kişiselleştirildi.",
      ],
      severity: "success",
      icon: "sparkles",
      actionLabel: "Planı gör",
      actionHref: "/meals",
    });

    // 5) Smart question — a single, contextual follow-up.
    const smartQuestion = !tracking.chattedToday
      ? "Bugün kendini enerjik mi yoksa yorgun mu hissediyorsun? Buna göre öğünlerini ayarlayabilirim."
      : waterRatio < 0.8
        ? "Gün içinde suyu unutmana ne sebep oluyor? Birlikte küçük bir hatırlatma ritmi kurabiliriz."
        : "Bu hafta hangi öğünde zorlanıyorsun? O öğüne özel pratik bir alternatif hazırlayayım.";
    insights.push({
      id: "smart-question",
      kind: "smart-question",
      title: "Sana Bir Sorum Var",
      summary: smartQuestion,
      details: ["Cevabını koç ekranında yazman yeterli; önerilerini ona göre güncelleyeceğim."],
      severity: "info",
      icon: "lightbulb",
      actionLabel: "Koça yaz",
      actionHref: "/ai",
    });

    // 6) Memory summary — what the coach "remembers".
    insights.push({
      id: "memory-summary",
      kind: "memory-summary",
      title: "Koçun Seni Nasıl Hatırlıyor",
      summary: `${profile.fullName} • ${profile.age} yaş • hedef ${profile.targetWeightKg.toLocaleString("tr-TR")} kg`,
      details: [
        profile.healthConditions.length > 0
          ? `Sağlık durumların: ${profile.healthConditions.join(", ")}.`
          : "Kayıtlı bir sağlık durumun bulunmuyor.",
        profile.allergies.length > 0
          ? `Alerjilerin: ${profile.allergies.join(", ")} — önerilerde bunlardan kaçınıyorum.`
          : "Kayıtlı alerjin yok.",
        `Beslenme tercihi: ${dietaryLabel(profile.dietaryPreference)}.`,
      ],
      severity: "info",
      icon: "message",
      actionLabel: "Profili düzenle",
      actionHref: "/profile/edit",
    });

    return insights;
  }, [
    profile,
    stats,
    tracking,
    bloodTests,
    weeklyReviewInsight,
    weeklyReviewLoading,
    monthlyReviewInsight,
    monthlyReviewLoading,
  ]);
}

function dietaryLabel(pref: string): string {
  switch (pref) {
    case "OMNIVORE":
      return "Her şey (omnivor)";
    case "VEGETARIAN":
      return "Vejetaryen";
    case "VEGAN":
      return "Vegan";
    case "PESCATARIAN":
      return "Pesketaryen";
    default:
      return pref;
  }
}
