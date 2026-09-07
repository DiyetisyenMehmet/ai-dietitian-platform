"use client";

import * as React from "react";

import {
  nutritionPlanClient,
  type HungerDecisionResult,
  type HungerLevel,
} from "@/infrastructure/nutrition/nutrition-plan-client";

interface NutritionPlanHungerCoachProps {
  planId: string;
  dayNumber: number;
}

const OPTIONS: Array<{ level: HungerLevel; label: string }> = [
  { level: "LIGHT", label: "Biraz açım" },
  { level: "HUNGRY", label: "Açım" },
  { level: "VERY_HUNGRY", label: "Çok açım" },
];

/** Inline deterministic hunger check-in with explicit adaptive-snack confirmation. */
export function NutritionPlanHungerCoach({ planId, dayNumber }: NutritionPlanHungerCoachProps) {
  const [loading, setLoading] = React.useState<HungerLevel | null>(null);
  const [accepting, setAccepting] = React.useState(false);
  const [acceptedEventId, setAcceptedEventId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<HungerDecisionResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function report(level: HungerLevel) {
    if (loading || accepting) return;
    setLoading(level);
    setError(null);
    setAcceptedEventId(null);
    try {
      const response = await nutritionPlanClient.reportHunger(planId, dayNumber, level);
      setResult(response.result);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Açlık değerlendirmesi yapılamadı.";
      setError(message);
    } finally {
      setLoading(null);
    }
  }

  async function acceptSnack() {
    if (!result?.suggestedSnack || accepting) return;
    setAccepting(true);
    setError(null);
    try {
      await nutritionPlanClient.acceptHungerSnack(planId, result.eventId);
      setAcceptedEventId(result.eventId);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Ara öğün kaydedilemedi.";
      setError(message);
    } finally {
      setAccepting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">Acıktım</h3>
          <p className="mt-1 text-xs leading-5 text-neutral-600">
            Şu anki açlığını seç. Sistem bugünkü öğün saatlerini ve plan durumunu değerlendirerek sana uygun yönlendirmeyi versin.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.level}
            type="button"
            disabled={loading !== null || accepting}
            onClick={() => void report(option.level)}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === option.level ? "Değerlendiriliyor…" : option.label}
          </button>
        ))}
      </div>

      {result && (
        <div className="mt-3 rounded-xl bg-neutral-50 p-3" aria-live="polite">
          <p className="text-sm leading-6 text-neutral-800">{result.message}</p>

          {result.suggestedSnack && (
            <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{result.suggestedSnack.name}</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    {result.suggestedSnack.calories} kcal · P {result.suggestedSnack.proteinGrams} g · K {result.suggestedSnack.carbsGrams} g · Y {result.suggestedSnack.fatGrams} g
                  </p>
                </div>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-neutral-700">
                {result.suggestedSnack.foods.map((food, index) => (
                  <li key={`${food.name}-${index}`} className="flex justify-between gap-3">
                    <span>{food.name} · {food.portion}</span>
                    <span>{Math.round(food.calories)} kcal</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-4 text-neutral-500">
                {result.suggestedSnack.source === "PLANNED_SNACK_REALLOCATION"
                  ? "Bu, planındaki mevcut ara öğünün erkene alınmış halidir; aynı ara öğünü daha sonra tekrar tüketme."
                  : "Bu seçenek, atlanan öğünden kalan enerji bütçesi içinden hesaplandı; günlük hedefin üzerine ekstra kalori olarak eklenmedi."}
              </p>
              <button
                type="button"
                disabled={accepting || acceptedEventId === result.eventId}
                onClick={() => void acceptSnack()}
                className="mt-3 w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {acceptedEventId === result.eventId
                  ? "Ara öğün kaydedildi"
                  : accepting
                    ? "Kaydediliyor…"
                    : "Bu ara öğünü tükettim"}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
