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

/** Inline, deterministic hunger check-in. No AI call is made by this component. */
export function NutritionPlanHungerCoach({ planId, dayNumber }: NutritionPlanHungerCoachProps) {
  const [loading, setLoading] = React.useState<HungerLevel | null>(null);
  const [result, setResult] = React.useState<HungerDecisionResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function report(level: HungerLevel) {
    if (loading) return;
    setLoading(level);
    setError(null);
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
            disabled={loading !== null}
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
          {result.suggestedSnackCalories !== null && (
            <p className="mt-2 text-xs font-medium text-neutral-600">
              Önerilen küçük ara öğün bütçesi: yaklaşık {result.suggestedSnackCalories} kcal
            </p>
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
