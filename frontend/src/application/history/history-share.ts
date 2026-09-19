import type {
  DailyHistoryResponse,
  HistoryComparisonResponse,
  HistoryInsightResponse,
  MetricComparison,
  ObservedNumber,
  PeriodCategoryCompleteness,
} from "@/domain/history/types";

export interface HistoryShareOptions {
  includeNutrition: boolean;
  includeWater: boolean;
  includeActivity: boolean;
  includeSleep: boolean;
  includeWeight: boolean;
  includeMealNames: boolean;
  includeAiInsight: boolean;
}

export interface HistoryShareSection {
  title: string;
  lines: string[];
}

export type HistoryShareVisualTone =
  | "nutrition"
  | "protein"
  | "water"
  | "activity"
  | "sleep"
  | "weight"
  | "neutral";

export interface HistoryShareVisualCard {
  title: string;
  tone: HistoryShareVisualTone;
  layout: "summary" | "comparison";
  value?: string;
  currentLabel?: string;
  currentValue?: string;
  previousLabel?: string;
  previousValue?: string;
  difference?: string;
  coverage?: string;
}

export interface HistorySharePayload {
  scope: "DAY" | "WEEK" | "MONTH";
  title: string;
  periodLabel: string;
  comparisonLabel: string | null;
  visualCards: HistoryShareVisualCard[];
  sections: HistoryShareSection[];
  aiInsight: string | null;
  footer: string;
}

export const DEFAULT_HISTORY_SHARE_OPTIONS: HistoryShareOptions = {
  includeNutrition: true,
  includeWater: true,
  includeActivity: true,
  includeSleep: false,
  includeWeight: false,
  includeMealNames: false,
  includeAiInsight: false,
};

function usable(observed: ObservedNumber): observed is ObservedNumber & { value: number } {
  return (
    observed.value !== null &&
    observed.state !== "UNAVAILABLE" &&
    observed.state !== "NO_RECORD" &&
    observed.state !== "UNKNOWN"
  );
}

function numberText(value: number, digits = 0): string {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: digits });
}

function value(observed: ObservedNumber, unit: string, digits = 0): string | null {
  if (!usable(observed)) return null;
  const text = `${numberText(observed.value, digits)}${unit}`;
  return observed.state === "PARTIAL_VALUE" ? `En az ${text}` : text;
}

function durationText(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} dk`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} sa` : `${hours} sa ${rest} dk`;
}

function durationValue(observed: ObservedNumber): string | null {
  if (!usable(observed)) return null;
  const text = durationText(observed.value);
  return observed.state === "PARTIAL_VALUE" ? `En az ${text}` : text;
}

function waterValue(observed: ObservedNumber): string | null {
  if (!usable(observed)) return null;
  const text =
    observed.value >= 1000
      ? `${numberText(observed.value / 1000, 1)} L`
      : `${numberText(observed.value)} ml`;
  return observed.state === "PARTIAL_VALUE" ? `En az ${text}` : text;
}

function formatDateOnly(date: string): string {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function coverageText(value: PeriodCategoryCompleteness): string {
  return value.status === "UNAVAILABLE"
    ? "Kayıt bilgisi alınamadı"
    : `${value.recordedDays}/${value.expectedDays} gün kayıt`;
}

function signedNumber(valueToFormat: number, unit: string, digits = 0): string {
  const sign = valueToFormat > 0 ? "+" : "";
  return `${sign}${numberText(valueToFormat, digits)}${unit}`;
}

function metricDifference(
  metric: MetricComparison,
  format: "number" | "water" | "duration" | "weight",
  unit = "",
  digits = 0,
): string {
  if (!metric.comparisonAvailable || metric.absoluteChange === null) return "Karşılaştırılamıyor";
  if (metric.absoluteChange === 0) return "Değişim yok";

  if (format === "duration") {
    return `${metric.absoluteChange > 0 ? "+" : "-"}${durationText(Math.abs(metric.absoluteChange))}`;
  }
  if (format === "water") {
    const absolute = Math.abs(metric.absoluteChange);
    const formatted =
      absolute >= 1000
        ? `${numberText(absolute / 1000, 1)} L`
        : `${numberText(absolute)} ml`;
    return `${metric.absoluteChange > 0 ? "+" : "-"}${formatted}`;
  }
  if (format === "weight") {
    return `${signedNumber(metric.absoluteChange, " kg", 1)} ${metric.absoluteChange > 0 ? "artış" : "azalış"}`;
  }
  return signedNumber(metric.absoluteChange, unit, digits);
}

function freezePayload(payload: HistorySharePayload): HistorySharePayload {
  return Object.freeze({
    ...payload,
    visualCards: payload.visualCards.map((card) => Object.freeze({ ...card })) as HistoryShareVisualCard[],
    sections: payload.sections.map((section) =>
      Object.freeze({
        title: section.title,
        lines: Object.freeze([...section.lines]) as unknown as string[],
      }),
    ) as HistoryShareSection[],
  });
}

export function buildDailyHistorySharePayload(
  history: DailyHistoryResponse,
  options: HistoryShareOptions,
  insight: HistoryInsightResponse | null,
): HistorySharePayload {
  const visualCards: HistoryShareVisualCard[] = [];
  const sections: HistoryShareSection[] = [];

  if (options.includeNutrition && history.nutrition.sourceStatus === "OK") {
    const nutritionLines: string[] = [];
    const calories = value(history.nutrition.totals.calories, " kcal");
    const protein = value(history.nutrition.totals.proteinG, " g", 1);
    const carbs = value(history.nutrition.totals.carbsG, " g", 1);
    const fat = value(history.nutrition.totals.fatG, " g", 1);

    if (calories) {
      visualCards.push({ title: "Toplam Kalori", tone: "nutrition", layout: "summary", value: calories });
      nutritionLines.push(`Kalori: ${calories}`);
    }
    if (protein) {
      visualCards.push({ title: "Protein", tone: "protein", layout: "summary", value: protein });
      nutritionLines.push(`Protein: ${protein}`);
    }
    if (carbs) nutritionLines.push(`Karbonhidrat: ${carbs}`);
    if (fat) nutritionLines.push(`Yağ: ${fat}`);

    if (options.includeMealNames) {
      const names = history.nutrition.meals
        .flatMap((meal) => meal.items.map((item) => item.name))
        .filter((name): name is string => Boolean(name?.trim()));
      if (names.length > 0) nutritionLines.push(`Öğünler: ${names.join(", ")}`);
    }

    if (nutritionLines.length > 0) sections.push({ title: "Beslenme", lines: nutritionLines });
  }

  if (options.includeWater && history.water.sourceStatus === "OK") {
    const water = waterValue(history.water.totalMl);
    if (water) {
      visualCards.push({ title: "Su", tone: "water", layout: "summary", value: water });
      sections.push({ title: "Su", lines: [`Kaydedilen su: ${water}`] });
    }
  }

  if (options.includeActivity && history.activity.sourceStatus === "OK") {
    const duration = durationValue(history.activity.totalActiveMinutes);
    const distance = value(history.activity.totalDistanceKm, " km", 1);
    const lines: string[] = [];
    if (duration) {
      visualCards.push({ title: "Toplam Hareket Süresi", tone: "activity", layout: "summary", value: duration });
      lines.push(`Hareket: ${duration}`);
    }
    if (distance) lines.push(`Mesafe: ${distance}`);
    if (history.activity.entries.length > 0) lines.push(`Aktivite kaydı: ${history.activity.entries.length}`);
    if (lines.length > 0) sections.push({ title: "Hareket", lines });
  }

  if (options.includeSleep && history.sleep.sourceStatus === "OK") {
    const sleep = durationValue(history.sleep.totalDurationMinutes);
    if (sleep) {
      visualCards.push({ title: "Uyku", tone: "sleep", layout: "summary", value: sleep });
      sections.push({ title: "Uyku", lines: [`Uyku: ${sleep}`] });
    }
  }

  if (options.includeWeight && history.weight.measurement) {
    const weight = `${numberText(history.weight.measurement.weightKg, 1)} kg`;
    visualCards.push({ title: "Kilo", tone: "weight", layout: "summary", value: weight });
    sections.push({ title: "Kilo", lines: [weight] });
  }

  return freezePayload({
    scope: "DAY",
    title: "Diewish • Gün Özeti",
    periodLabel: formatDateOnly(history.date),
    comparisonLabel: null,
    visualCards,
    sections,
    aiInsight: options.includeAiInsight ? insight?.content.text ?? null : null,
    footer: "Diewish ile günümü takip ediyorum • Yalnız seçtiğin kayıtlar paylaşılır",
  });
}

function comparisonCard(
  title: string,
  tone: HistoryShareVisualTone,
  metric: MetricComparison,
  currentLabel: string,
  previousLabel: string,
  currentValue: string | null,
  previousValue: string | null,
  difference: string,
  coverage: string,
): HistoryShareVisualCard | null {
  if (!currentValue && !previousValue) return null;
  return {
    title,
    tone,
    layout: "comparison",
    currentLabel,
    currentValue: currentValue ?? "Kayıt yok",
    previousLabel,
    previousValue: previousValue ?? "Kayıt yok",
    difference,
    coverage,
  };
}

function comparisonLine(card: HistoryShareVisualCard): string {
  return `${card.title}: ${card.currentLabel} ${card.currentValue} • ${card.previousLabel} ${card.previousValue} • Fark ${card.difference}`;
}

export function buildComparisonHistorySharePayload(
  comparison: HistoryComparisonResponse,
  options: HistoryShareOptions,
  insight: HistoryInsightResponse | null,
): HistorySharePayload {
  const visualCards: HistoryShareVisualCard[] = [];
  const sections: HistoryShareSection[] = [];
  const week = comparison.periodType === "WEEK";
  const currentLabel = week ? "Bu hafta" : "Bu ay";
  const previousLabel = week ? "Geçen hafta" : "Geçen ay";

  const add = (sectionTitle: string, card: HistoryShareVisualCard | null) => {
    if (!card) return;
    visualCards.push(card);
    const existing = sections.find((section) => section.title === sectionTitle);
    if (existing) existing.lines.push(comparisonLine(card));
    else sections.push({ title: sectionTitle, lines: [comparisonLine(card)] });
  };

  if (options.includeNutrition) {
    const calories = comparison.metrics.nutrition.averageCaloriesPerQuantifiedDay;
    const protein = comparison.metrics.nutrition.averageProteinGPerQuantifiedDay;
    add("Beslenme", comparisonCard(
      "Günlük Ortalama Kalori",
      "nutrition",
      calories,
      currentLabel,
      previousLabel,
      value(calories.current, " kcal"),
      value(calories.previous, " kcal"),
      metricDifference(calories, "number", " kcal"),
      coverageText(comparison.completeness.current.nutrition),
    ));
    add("Beslenme", comparisonCard(
      "Günlük Ortalama Protein",
      "protein",
      protein,
      currentLabel,
      previousLabel,
      value(protein.current, " g", 1),
      value(protein.previous, " g", 1),
      metricDifference(protein, "number", " g", 1),
      coverageText(comparison.completeness.current.nutrition),
    ));
  }

  if (options.includeWater) {
    const water = comparison.metrics.water.averageMlPerRecordedDay;
    add("Su", comparisonCard(
      "Günlük Ortalama Su",
      "water",
      water,
      currentLabel,
      previousLabel,
      waterValue(water.current),
      waterValue(water.previous),
      metricDifference(water, "water"),
      coverageText(comparison.completeness.current.water),
    ));
  }

  if (options.includeActivity) {
    const activity = comparison.metrics.activity.totalActiveMinutes;
    add("Hareket", comparisonCard(
      "Toplam Hareket Süresi",
      "activity",
      activity,
      currentLabel,
      previousLabel,
      durationValue(activity.current),
      durationValue(activity.previous),
      metricDifference(activity, "duration"),
      coverageText(comparison.completeness.current.activity),
    ));
  }

  if (options.includeSleep) {
    const sleep = comparison.metrics.sleep.averageDurationPerRecordedNight;
    add("Uyku", comparisonCard(
      "Ortalama Uyku Süresi",
      "sleep",
      sleep,
      currentLabel,
      previousLabel,
      durationValue(sleep.current),
      durationValue(sleep.previous),
      metricDifference(sleep, "duration"),
      coverageText(comparison.completeness.current.sleep),
    ));
  }

  if (options.includeWeight) {
    const weight = comparison.metrics.weight.lastMeasurementKg;
    add("Kilo", comparisonCard(
      "Kilo",
      "weight",
      weight,
      currentLabel,
      previousLabel,
      value(weight.current, " kg", 1),
      value(weight.previous, " kg", 1),
      metricDifference(weight, "weight"),
      `${comparison.completeness.current.weight.measurementCount} ölçüm`,
    ));
  }

  const label =
    comparison.currentPeriod.localStartDate === comparison.currentPeriod.localEndDateInclusive
      ? formatDateOnly(comparison.currentPeriod.localStartDate)
      : `${formatDateOnly(comparison.currentPeriod.localStartDate)} – ${formatDateOnly(
          comparison.currentPeriod.localEndDateInclusive,
        )}`;

  return freezePayload({
    scope: comparison.periodType,
    title: week ? "Diewish • Haftalık Karşılaştırma" : "Diewish • Aylık Karşılaştırma",
    periodLabel: label,
    comparisonLabel: week
      ? "Bu hafta ↔ Geçen haftanın aynı dönemi"
      : "Bu ay ↔ Geçen ayın aynı dönemi",
    visualCards,
    sections,
    aiInsight: options.includeAiInsight ? insight?.content.text ?? null : null,
    footer: "Diewish • Yalnız seçtiğin kayıtlar paylaşılır",
  });
}
