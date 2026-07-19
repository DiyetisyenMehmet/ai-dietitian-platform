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
 * A rotation seed that changes on every dashboard visit so the coach feels
 * alive and never repeats the exact same wording twice in a row. It combines
 * the day-of-year (stable within a day) with a per-mount random tick.
 */
function useVisitSeed(): number {
  const [seed, setSeed] = React.useState(0);
  React.useEffect(() => {
    const now = new Date();
    const dayOfYear = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
    );
    setSeed(dayOfYear + Math.floor(Math.random() * 997));
  }, []);
  return seed;
}

/** Deterministically pick one variant from a list using the visit seed. */
function pick<T>(variants: readonly T[], seed: number, salt = 0): T {
  return variants[(seed + salt) % variants.length];
}

/**
 * Generates prioritized, proactive coach insights from the user's state.
 * Returns up to `limit` cards (default 3), most important first.
 *
 * Messages rotate between hand-written Turkish variants keyed by the visit
 * seed, so the dashboard feels slightly different on each visit while the
 * underlying reasoning (observe → analyze → recommend → motivate) stays
 * deterministic and non-shaming.
 */
export function useCoachInsights(limit = 3): CoachInsight[] {
  const profile = useHealthProfile();
  const meals = useMeals();
  const { waterMl, waterGoalMl, chattedToday } = useDailyTracking();
  const weightEntries = useWeightEntries();
  const hour = useHour();
  const seed = useVisitSeed();

  return React.useMemo(() => {
    const insights: CoachInsight[] = [];
    const analysis = analyzeWeight(weightEntries, profile.targetWeightKg);
    const foodsIn = (slot: string) => meals.find((m) => m.slot === slot)?.foods.length ?? 0;
    const firstName = profile.fullName.split(" ")[0] ?? "";

    // 1. Success celebration (highest priority — positive reinforcement).
    if (analysis.status === "reached") {
      insights.push({
        id: "coach-reached",
        tone: "success",
        title: "Hedefine ulaştın! 🎉",
        message: pick(
          [
            "Bu büyük bir başarı. Kazandığın dengeyi korumak için planını birlikte güncelleyelim.",
            "Harika iş çıkardın! Şimdi bu formu koruma planına geçelim.",
            "Emeklerinin karşılığını aldın. Bundan sonrası için sürdürme moduna geçebiliriz.",
          ],
          seed,
        ),
        icon: "trophy",
        actionLabel: "İlerlememi gör",
        actionHref: "/progress",
      });
    } else if (analysis.status === "ahead") {
      insights.push({
        id: "coach-ahead",
        tone: "success",
        title: pick(["Planından öndesin", "Harika gidiyorsun", "Beklentinin ilerisindesin"], seed),
        message: analysis.message,
        icon: "activity",
        actionLabel: "İlerlememi gör",
        actionHref: "/progress",
      });
    }

    // 2. Goal deviation — gentle, non-shaming "why this matters" nudge.
    if (analysis.status === "behind") {
      insights.push({
        id: "coach-behind",
        tone: "nudge",
        title: pick(["Birlikte bakalım mı?", "Küçük bir ayar yapalım", "Rotayı birlikte düzeltelim"], seed),
        message: pick(
          [
            "İlerlemenin biraz yavaşladığını fark ettim. Bu normal — birkaç soruyla planını nazikçe ayarlayabilirim.",
            "Son günlerde tempo düşmüş görünüyor. Neden önemli? Küçük düzeltmeler hedefine giden süreyi kısaltır.",
            "Grafiğin biraz yatay seyrediyor. Endişelenme; birlikte gözden geçirip yeniden ivme kazanabiliriz.",
          ],
          seed,
        ),
        icon: "heart",
        actionLabel: "Koçla konuş",
        actionHref: "/ai",
      });
    }

    // 3. Weigh-in reminder ("why this matters": tracking accuracy).
    if (analysis.isWeighInDue) {
      insights.push({
        id: "coach-weigh-in",
        tone: "info",
        title: pick(["Tartılma zamanı", "Bugün tartılma günün", "Haftalık ölçüm vakti"], seed),
        message: pick(
          [
            "Bu haftaki kilonu kaydedersen ilerlemeni daha net takip edebiliriz.",
            "Düzenli ölçüm, önerilerimin doğruluğunu artırır. Bugünkü kilonu ekleyelim mi?",
            "Bir haftadır yeni ölçüm görmedim. Güncel kilon, planını isabetli tutmama yardımcı olur.",
          ],
          seed,
        ),
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
        title: pick(["Öğle yemeğini atladın mı?", "Öğlen ne yedin?", "Öğle öğününü ekleyelim"], seed),
        message: pick(
          [
            "Öğününü kaydedersen günlük dengeni birlikte takip edebiliriz.",
            "Öğlen öğününü görmedim. Eklersen kalan gün için daha iyi öneriler sunabilirim.",
            "Ne yediğini bilirsem protein ve kalori hedefini daha isabetli ayarlayabilirim.",
          ],
          seed,
        ),
        icon: "utensils",
        actionLabel: "Öğün ekle",
        actionHref: "/meals/add",
      });
    } else if (hour >= 10 && foodsIn("breakfast") === 0) {
      insights.push({
        id: "coach-breakfast",
        tone: "nudge",
        title: pick(["Güne kahvaltıyla başla", "Kahvaltını ekledin mi?", "Sabah öğünün nasıldı?"], seed),
        message: pick(
          [
            "Kahvaltını henüz görmedim. Eklersen günün için daha iyi öneriler sunabilirim.",
            "Güne iyi bir kahvaltı ile başlamak gün boyu enerjini dengeler. Ne yediğini ekleyelim mi?",
            "Sabah öğününü kaydedersen günlük hedeflerini baştan planlayabiliriz.",
          ],
          seed,
        ),
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
        title: pick(["Su içmeyi unutma", "Biraz su içelim", "Sıvı dengeni koru"], seed),
        message: `Bugün ${(waterMl / 1000).toLocaleString("tr-TR")} L su içtin. ${pick(
          [
            "Hedefinin yarısına birlikte ulaşalım.",
            "Bir bardak daha eklemek metabolizmana iyi gelir.",
            "Küçük yudumlarla hedefe yaklaşabiliriz.",
          ],
          seed,
        )}`,
        icon: "droplet",
        actionLabel: "Su ekle",
        actionHref: "/dashboard",
      });
    }

    // 6. Blood test periodic reminder ("why this matters": data-driven plans).
    const memberDays = Math.round(
      (Date.now() - new Date(profile.memberSince).getTime()) / 86_400_000,
    );
    if (memberDays >= 30) {
      insights.push({
        id: "coach-blood-test",
        tone: "info",
        title: pick(["Kontrol zamanı yaklaşıyor", "Kan tahlilini güncelleyelim", "Sağlık verini tazele"], seed),
        message: pick(
          [
            "Güncel bir kan tahlili yüklersen önerilerini sağlık verilerine göre yenileyebilirim.",
            "Bir süredir yeni tahlil görmedim. Yüklersen planını laboratuvar sonuçlarına göre kişiselleştiririm.",
            "Kan değerlerin, sana özel beslenme önerilerinin temelini oluşturur. Güncel bir sonuç ekleyelim mi?",
          ],
          seed,
        ),
        icon: "flask",
        actionLabel: "Tahlil yükle",
        actionHref: "/profile/blood-tests",
      });
    }

    // 7. Weekly encouragement — positive, recurring motivation.
    {
      const loggedMeals = meals.reduce((sum, m) => sum + m.foods.length, 0);
      if (loggedMeals > 0 || weightEntries.length > 1) {
        insights.push({
          id: "coach-weekly-encouragement",
          tone: "success",
          title: pick(
            [
              firstName ? `Bu hafta harikasın, ${firstName}` : "Bu hafta harikasın",
              "Küçük adımlar, büyük fark",
              "İstikrarın işe yarıyor",
            ],
            seed,
          ),
          message: pick(
            [
              "Düzenli kayıt tutman, hedefine giden yolda en güçlü alışkanlığın. Böyle devam!",
              "Her kayıt, seni tanımamı ve daha isabetli öneriler sunmamı sağlıyor. Teşekkürler!",
              "Sürekliliğin motivasyonunu canlı tutuyor. Bu ritmi korursak sonuçlar kendini gösterecek.",
            ],
            seed,
          ),
          icon: "sparkles",
          actionLabel: "İlerlememi gör",
          actionHref: "/progress",
        });
      }
    }

    // 8. Healthy-habit reminder — gentle lifestyle nudge (evening).
    if (hour >= 20) {
      insights.push({
        id: "coach-habit-evening",
        tone: "info",
        title: pick(["Güzel bir gün için hazırlık", "Yarına hazırlan", "Akşam rutini"], seed),
        message: pick(
          [
            "Erken ve düzenli uyku, iştah hormonlarını dengeler. Bugünü güzel bir dinlenmeyle kapatalım.",
            "Yatmadan önce hafif bir yürüyüş sindirime iyi gelir. Yarın için enerji topla.",
            "Ekran süreni azaltmak uyku kaliteni artırır. Yarın seni yeni hedeflerle karşılayacağım.",
          ],
          seed,
        ),
        icon: "moon",
      });
    }

    // 9. Encourage first conversation of the day.
    if (!chattedToday) {
      insights.push({
        id: "coach-chat",
        tone: "info",
        title: pick(
          [
            "Bugün nasıl yardımcı olabilirim?",
            firstName ? `Merhaba ${firstName}, sohbet edelim mi?` : "Sohbet edelim mi?",
            "Aklına takılan bir şey var mı?",
          ],
          seed,
        ),
        message: pick(
          [
            "Beslenme, planın ya da tahlillerinle ilgili aklına takılanları bana sorabilirsin.",
            "Bugünkü öğünlerin ya da hedeflerinle ilgili istediğini sorabilirsin — buradayım.",
            "Küçük bir soru bile planını iyileştirebilir. Hadi başlayalım.",
          ],
          seed,
        ),
        icon: "message",
        actionLabel: "Koçla konuş",
        actionHref: "/ai",
      });
    }

    return insights.slice(0, limit);
  }, [profile, meals, waterMl, waterGoalMl, chattedToday, weightEntries, hour, seed, limit]);
}

/** The single most important "next recommended action" for the dashboard hero. */
export function useNextAction(): CoachInsight | null {
  const insights = useCoachInsights(1);
  return insights[0] ?? null;
}
