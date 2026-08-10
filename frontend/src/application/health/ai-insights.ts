"use client";

import * as React from "react";

import type { AiInsight } from "@/domain/health/types";
import { useHealthProfile } from "./health-profile-store";
import { useWeightEntries } from "./weight-store";
import { useProgressStats } from "./progress-analytics";
import { useDailyTracking } from "./daily-tracking-store";
import { useHealthScore } from "./health-score";
import { useBloodTests } from "./blood-test-store";
import { useSubscription } from "@/application/payments/subscription-store";

/**
 * Surfaces the Sprint 19 "AI intelligence" as user-facing insight cards:
 * weekly review, monthly review (premium), risk alerts, nutrition adaptations,
 * a smart follow-up question and a memory summary.
 *
 * Derived locally from the shared session stores (placeholder data layer,
 * backend-ready) so it stays consistent with the rest of the app. All copy is
 * Turkish, coaching-toned and explicitly framed as guidance — never medical
 * diagnosis.
 */
export function useAiInsights(): AiInsight[] {
  const profile = useHealthProfile();
  const entries = useWeightEntries();
  const stats = useProgressStats(entries, profile.targetWeightKg);
  const tracking = useDailyTracking();
  const score = useHealthScore();
  const bloodTests = useBloodTests();
  const { subscription } = useSubscription();

  const isPremium = subscription.tier !== "FREE";

  return React.useMemo(() => {
    const insights: AiInsight[] = [];

    // 1) Weekly review — always available.
    const weeklyLine =
      stats.weeklyChangeKg == null
        ? "Bu hafta yeterli kilo kaydın yok; düzenli tartılırsan haftalık özetin daha isabetli olur."
        : stats.weeklyChangeKg < 0
          ? `Bu hafta ${Math.abs(stats.weeklyChangeKg).toLocaleString("tr-TR")} kg verdin — istikrarlı gidiyorsun.`
          : stats.weeklyChangeKg > 0
            ? `Bu hafta ${stats.weeklyChangeKg.toLocaleString("tr-TR")} kg aldın; birlikte nedenlerine bakabiliriz.`
            : "Kilon bu hafta sabit kaldı; bu da bir denge işareti olabilir.";
    insights.push({
      id: "weekly-review",
      kind: "weekly-review",
      title: "Haftalık Değerlendirme",
      summary: weeklyLine,
      details: [
        `Sağlık skorun şu an ${score.score}/100 (${score.band}).`,
        tracking.chattedToday
          ? "Bu hafta koçunla düzenli konuştun; bu takibi güçlü tutuyor."
          : "Koçunla daha sık konuşman, önerileri sana göre inceltmemi sağlar.",
        "Bu bir özet rehberliktir, tıbbi teşhis değildir.",
      ],
      severity: "info",
      icon: "calendar",
      actionLabel: "İlerlemeyi gör",
      actionHref: "/progress",
    });

    // 2) Monthly review — premium.
    const monthlyLine =
      stats.monthlyChangeKg == null
        ? "Aylık trendini çıkarmak için biraz daha veri topluyoruz."
        : `Son 30 günde toplam ${stats.monthlyChangeKg < 0 ? "" : "+"}${stats.monthlyChangeKg.toLocaleString("tr-TR")} kg değişim var.`;
    insights.push({
      id: "monthly-review",
      kind: "monthly-review",
      title: "Aylık Derin Analiz",
      summary: isPremium
        ? monthlyLine
        : "Aylık derin analiz, öğün-kilo-tahlil ilişkilerini bir arada yorumlar.",
      details: isPremium
        ? [
            stats.interpretation,
            stats.estimatedTargetLabel
              ? `Bu tempoyla tahmini hedef tarihi: ${stats.estimatedTargetLabel}.`
              : "Tempo netleştikçe hedef tarihi tahminini paylaşacağım.",
          ]
        : ["Premium ile aylık kapsamlı değerlendirmenin kilidini açabilirsin."],
      severity: "info",
      icon: "trending-up",
      premium: !isPremium,
      actionLabel: isPremium ? "Detaylı analiz" : "Premium'a geç",
      actionHref: isPremium ? "/progress" : "/profile/subscription",
    });

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
  }, [profile, stats, tracking, score, bloodTests, isPremium]);
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
