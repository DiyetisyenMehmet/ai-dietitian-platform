import type { NutrientValues } from "./nutrition-data.types";

export interface DailyNutritionTargets {
  calories: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  mealsPerDay: number;
}

export interface DailyNutritionConsumed {
  calories: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
}

export interface NutritionPersonalizationMetrics {
  contribution: {
    caloriesPercent: number | null;
    proteinPercent: number | null;
    carbohydratesPercent: number | null;
    fatPercent: number | null;
  };
  remainingAfter: {
    calories: number | null;
    proteinG: number | null;
    carbohydratesG: number | null;
    fatG: number | null;
  };
  portionFit: "LOW" | "BALANCED" | "HIGH" | "UNKNOWN";
  satiety: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  lines: string[];
}

function round(value: number): number { return Math.round(value * 10) / 10; }
function pct(value: number | null, target: number): number | null {
  return value === null || !Number.isFinite(target) || target <= 0 ? null : round((value / target) * 100);
}
function remaining(consumed: number, item: number | null, target: number): number | null {
  if (item === null || !Number.isFinite(target) || target <= 0) return null;
  return round(Math.max(0, target - consumed - item));
}

function satiety(nutrients: NutrientValues): NutritionPersonalizationMetrics["satiety"] {
  const protein = nutrients.proteinG;
  const fiber = nutrients.fiberG;
  if (protein === null && fiber === null) return "UNKNOWN";
  if ((protein ?? 0) >= 20 || (fiber ?? 0) >= 6) return "HIGH";
  if ((protein ?? 0) >= 10 || (fiber ?? 0) >= 3) return "MEDIUM";
  return "LOW";
}

function portionFit(kcal: number | null, targets: DailyNutritionTargets): NutritionPersonalizationMetrics["portionFit"] {
  if (kcal === null || targets.calories <= 0 || targets.mealsPerDay <= 0) return "UNKNOWN";
  const nominalMealCalories = targets.calories / targets.mealsPerDay;
  const ratio = kcal / nominalMealCalories;
  if (ratio < 0.55) return "LOW";
  if (ratio <= 1.3) return "BALANCED";
  return "HIGH";
}

export function deriveNutritionPersonalization(
  nutrients: NutrientValues,
  targets: DailyNutritionTargets,
  consumed: DailyNutritionConsumed,
): NutritionPersonalizationMetrics {
  const contribution = {
    caloriesPercent: pct(nutrients.energyKcal, targets.calories),
    proteinPercent: pct(nutrients.proteinG, targets.proteinG),
    carbohydratesPercent: pct(nutrients.carbohydratesG, targets.carbohydratesG),
    fatPercent: pct(nutrients.fatG, targets.fatG),
  };
  const remainingAfter = {
    calories: remaining(consumed.calories, nutrients.energyKcal, targets.calories),
    proteinG: remaining(consumed.proteinG, nutrients.proteinG, targets.proteinG),
    carbohydratesG: remaining(consumed.carbohydratesG, nutrients.carbohydratesG, targets.carbohydratesG),
    fatG: remaining(consumed.fatG, nutrients.fatG, targets.fatG),
  };
  const fit = portionFit(nutrients.energyKcal, targets);
  const satietyLevel = satiety(nutrients);
  const lines: string[] = [];

  if (contribution.caloriesPercent !== null) lines.push(`Bu porsiyon günlük kalori hedefinin yaklaşık %${contribution.caloriesPercent} kadarına denk geliyor.`);
  if (contribution.proteinPercent !== null) lines.push(`Günlük protein hedefinin yaklaşık %${contribution.proteinPercent} kadarını sağlıyor.`);
  if (remainingAfter.calories !== null) lines.push(`Bu porsiyondan sonra bugünkü hedefe göre yaklaşık ${remainingAfter.calories} kcal kalıyor.`);
  if (nutrients.fiberG !== null) lines.push(`Bu porsiyonda yaklaşık ${round(nutrients.fiberG)} g lif var.`);
  if (nutrients.sugarsG !== null) lines.push(`Bu porsiyonda yaklaşık ${round(nutrients.sugarsG)} g şeker var.`);
  if (nutrients.sodiumMg !== null) lines.push(`Bu porsiyonda yaklaşık ${round(nutrients.sodiumMg)} mg sodyum var.`);
  if (fit === "BALANCED") lines.push("Porsiyon enerjisi, aktif planındaki öğün başına yaklaşık enerji dağılımıyla uyumlu görünüyor.");
  if (fit === "HIGH") lines.push("Porsiyon enerjisi, aktif planındaki ortalama öğün payından yüksek; porsiyonu küçültmek günlük bütçeyi dengelemeyi kolaylaştırabilir.");
  if (fit === "LOW") lines.push("Porsiyon enerjisi aktif planındaki ortalama öğün payının altında; öğünün geri kalan içeriği de önemlidir.");
  if (satietyLevel === "HIGH") lines.push("Protein/lif içeriğine göre tokluk katkısı görece yüksek olabilir.");
  if (satietyLevel === "MEDIUM") lines.push("Protein/lif içeriğine göre orta düzeyde tokluk katkısı sağlayabilir.");

  return { contribution, remainingAfter, portionFit: fit, satiety: satietyLevel, lines };
}
