"use client";

import * as React from "react";

import type { CoachInsight, FoodWarning, HealthProfile } from "@/domain/health/types";
import { useMeals } from "@/application/meals/meals-store";
import { useHealthProfile } from "./health-profile-store";
import { useDailyTracking } from "./daily-tracking-store";
import { analyzeWeight, useWeightEntries } from "./weight-store";

/**
 * The AI Health Coach reasoning layer.
 *
 * Produces proactive coaching cards (observe → analyze → recommend → motivate)
 * and evaluates whether a logged food conflicts with the user's medical
 * conditions or allergies. It provides safe *nutrition guidance only* and never
 * a medical diagnosis, and is written to never shame the user.
 */

/** Keyword groups (Turkish) that map a health condition to risky foods. */
const CONDITION_FOOD_RISKS: Record<string, { keywords: string[]; reason: string }> = {
  Hipertansiyon: {
    keywords: [
      "tuz",
      "turşu",
      "salam",
      "sucuk",
      "sosis",
      "pastırma",
      "konserve",
      "cips",
      "zeytin",
      "hazır çorba",
      "soda",
      "ançüez",
    ],
    reason: "yüksek sodyum içerebilir",
  },
  "İnsülin Direnci": {
    keywords: [
      "şeker",
      "tatlı",
      "baklava",
      "beyaz ekmek",
      "pilav",
      "patates",
      "meyve suyu",
      "bal",
      "reçel",
      "kola",
      "çikolata",
      "kek",
      "bisküvi",
    ],
    reason: "kan şekerini hızla yükseltebilir",
  },
  Diyabet: {
    keywords: [
      "şeker",
      "tatlı",
      "baklava",
      "beyaz ekmek",
      "pilav",
      "patates",
      "meyve suyu",
      "bal",
      "reçel",
      "kola",
      "çikolata",
      "kek",
      "bisküvi",
    ],
    reason: "yüksek glisemik indekse sahip olabilir",
  },
  "Yüksek Kolesterol": {
    keywords: ["kızartma", "tereyağı", "kaymak", "sucuk", "salam", "kırmızı et", "margarin"],
    reason: "yüksek doymuş yağ içerebilir",
  },
  Çölyak: {
    keywords: ["ekmek", "makarna", "bulgur", "un", "börek", "bisküvi", "kek", "erişte"],
    reason: "gluten içerebilir",
  },
};

/** Keyword groups (Turkish) that map an allergy to allergenic foods. */
const ALLERGY_RISKS: Record<string, string[]> = {
  Fıstık: ["fıstık", "yer fıstığı"],
  Kuruyemiş: ["badem", "ceviz", "fındık", "antep fıstığı", "kaju", "kuruyemiş"],
  "Süt / Laktoz": ["süt", "peynir", "yoğurt", "kaymak", "dondurma", "ayran", "krema"],
  Yumurta: ["yumurta"],
  Gluten: ["ekmek", "makarna", "un", "bulgur", "börek", "erişte"],
  "Deniz Ürünleri": ["balık", "karides", "midye", "kalamar", "somon", "ton"],
  Soya: ["soya"],
  Susam: ["susam", "tahin"],
};

/**
 * Evaluates a food name against the profile's allergies (danger) and
 * conditions (caution). Returns any warnings — guidance only, no diagnosis.
 */
export function evaluateFoodWarnings(profile: HealthProfile, foodName: string): FoodWarning[] {
  const name = foodName.toLocaleLowerCase("tr-TR");
  const warnings: FoodWarning[] = [];

  for (const allergy of profile.allergies) {
    const keywords = ALLERGY_RISKS[allergy];
    if (keywords?.some((k) => name.includes(k))) {
      warnings.push({
        id: `allergy-${allergy}`,
        severity: "danger",
        trigger: allergy,
        message: `Bu besin "${allergy}" alerjinle ilişkili olabilir. Etiketini dikkatle kontrol et.`,
      });
    }
  }

  for (const condition of profile.healthConditions) {
    const risk = CONDITION_FOOD_RISKS[condition];
    if (risk?.keywords.some((k) => name.includes(k))) {
      warnings.push({
        id: `condition-${condition}`,
        severity: "caution",
        trigger: condition,
        message: `${condition} için bu besin ${risk.reason}. Porsiyonunu dengede tutmayı düşünebilirsin.`,
      });
    }
  }

  return warnings;
}

/** Convenience hook: warnings for a food against the current profile. */
export function useFoodWarnings(foodName: string): FoodWarning[] {
  const profile = useHealthProfile();
  return React.useMemo(
    () => (foodName.trim() ? evaluateFoodWarnings(profile, foodName) : []),
    [profile, foodName],
  );
}

/** Current hour helper (client-only; used for time-aware nudges). */
function useHour(): number {
  const [hour, setHour] = React.useState<number | null>(null);
  React.useEffect(() => setHour(new Date().getHours()), []);
  return hour ?? 12;
}

/**
 * Generates prioritized, proactive coach insights from the user's state.
 * Returns up to `limit` cards (default 3), most important first.
 */
export function useCoachInsights(limit = 3): CoachInsight[] {
  const profile = useHealthProfile();
  const meals = useMeals();
  const { waterMl, waterGoalMl, chattedToday } = useDailyTracking();
  const weightEntries = useWeightEntries();
  const hour = useHour();

  return React.useMemo(() => {
    const insights: CoachInsight[] = [];
    const analysis = analyzeWeight(weightEntries, profile.targetWeightKg);
    const foodsIn = (slot: string) => meals.find((m) => m.slot === slot)?.foods.length ?? 0;

    // 1. Success celebration (highest priority — positive reinforcement).
    if (analysis.status === "reached") {
      insights.push({
        id: "coach-reached",
        tone: "success",
        title: "Hedefine ulaştın! 🎉",
        message: "Bu büyük bir başarı. Kazandığın dengeyi korumak için planını birlikte güncelleyelim.",
        icon: "trophy",
        actionLabel: "İlerlememi gör",
        actionHref: "/progress",
      });
    } else if (analysis.status === "ahead") {
      insights.push({
        id: "coach-ahead",
        tone: "success",
        title: "Planından öndesin",
        message: analysis.message,
        icon: "activity",
        actionLabel: "İlerlememi gör",
        actionHref: "/progress",
      });
    }

    // 2. Goal deviation — gentle, non-shaming nudge.
    if (analysis.status === "behind") {
      insights.push({
        id: "coach-behind",
        tone: "nudge",
        title: "Birlikte bakalım mı?",
        message:
          "İlerlemenin biraz yavaşladığını fark ettim. Sana birkaç soru sorup planını nazikçe ayarlayabilirim.",
        icon: "heart",
        actionLabel: "Koçla konuş",
        actionHref: "/ai",
      });
    }

    // 3. Weigh-in reminder.
    if (analysis.isWeighInDue) {
      insights.push({
        id: "coach-weigh-in",
        tone: "info",
        title: "Tartılma zamanı",
        message: "Bu haftaki kilonu kaydedersen ilerlemeni daha net takip edebiliriz.",
        icon: "scale",
        actionLabel: "Kilo kaydet",
        actionHref: "/progress",
      });
    }

    // 4. Missing meals (time-aware).
    if (hour >= 14 && foodsIn("lunch") === 0) {
      insights.push({
        id: "coach-lunch",
        tone: "nudge",
        title: "Öğle yemeğini atladın mı?",
        message: "Öğününü kaydedersen günlük dengeni birlikte takip edebiliriz.",
        icon: "utensils",
        actionLabel: "Öğün ekle",
        actionHref: "/meals/add",
      });
    } else if (hour >= 10 && foodsIn("breakfast") === 0) {
      insights.push({
        id: "coach-breakfast",
        tone: "nudge",
        title: "Güne kahvaltıyla başla",
        message: "Kahvaltını henüz görmedim. Eklersen günün için daha iyi öneriler sunabilirim.",
        icon: "utensils",
        actionLabel: "Kahvaltı ekle",
        actionHref: "/meals/add",
      });
    }

    // 5. Low water intake (afternoon+).
    if (hour >= 12 && waterMl < waterGoalMl * 0.5) {
      insights.push({
        id: "coach-water",
        tone: "info",
        title: "Su içmeyi unutma",
        message: `Bugün ${(waterMl / 1000).toLocaleString("tr-TR")} L su içtin. Hedefinin yarısına birlikte ulaşalım.`,
        icon: "droplet",
      });
    }

    // 6. Blood test periodic reminder.
    const memberDays = Math.round(
      (Date.now() - new Date(profile.memberSince).getTime()) / 86_400_000,
    );
    if (memberDays >= 30) {
      insights.push({
        id: "coach-blood-test",
        tone: "info",
        title: "Kontrol zamanı yaklaşıyor",
        message: "Güncel bir kan tahlili yüklersen önerilerini sağlık verilerine göre yenileyebilirim.",
        icon: "flask",
        actionLabel: "Koça sor",
        actionHref: "/ai",
      });
    }

    // 7. Encourage first conversation.
    if (!chattedToday) {
      insights.push({
        id: "coach-chat",
        tone: "info",
        title: "Bugün nasıl yardımcı olabilirim?",
        message: "Beslenme, planın ya da tahlillerinle ilgili aklına takılanları bana sorabilirsin.",
        icon: "sparkles",
        actionLabel: "Koçla konuş",
        actionHref: "/ai",
      });
    }

    return insights.slice(0, limit);
  }, [profile, meals, waterMl, waterGoalMl, chattedToday, weightEntries, hour, limit]);
}

/** The single most important "next recommended action" for the dashboard hero. */
export function useNextAction(): CoachInsight | null {
  const insights = useCoachInsights(1);
  return insights[0] ?? null;
}
