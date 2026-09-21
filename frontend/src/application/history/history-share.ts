import type {
  DailyHistoryResponse,
  HistoryComparisonResponse,
  HistoryInsightResponse,
  MetricComparison,
  ObservedNumber,
  PeriodCategoryCompleteness,
} from "@/domain/history/types";
import {
  comparisonDeltaText,
  comparisonMissingNote,
  comparisonValueText,
  netWeightValueText,
  weightComparisonPresentation,
  type ComparisonValueFormat,
} from "@/application/history/history-comparison-format";

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
  description?: string;
  tone: HistoryShareVisualTone;
  layout: "summary" | "comparison";
  value?: string;
  currentLabel?: string;
  currentValue?: string;
  previousLabel?: string;
  previousValue?: string;
  difference?: string;
  coverage?: string;
  note?: string | null;
}

export interface HistorySharePayload {
  kind: "normal" | "comparison";
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
    Number.isFinite(observed.value) &&
    (observed.state === "KNOWN_ZERO" ||
      observed.state === "KNOWN_VALUE" ||
      observed.state === "PARTIAL_VALUE")
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

function matchingInsight(
  insight: HistoryInsightResponse | null,
  scope: HistorySharePayload["scope"],
) {
  return insight?.scope === scope ? insight.content.text : null;
}

function periodLabel(comparison: HistoryComparisonResponse) {
  return comparison.currentPeriod.localStartDate === comparison.currentPeriod.localEndDateInclusive
    ? formatDateOnly(comparison.currentPeriod.localStartDate)
    : `${formatDateOnly(comparison.currentPeriod.localStartDate)} – ${formatDateOnly(
        comparison.currentPeriod.localEndDateInclusive,
      )}`;
}

function freezePayload(payload: HistorySharePayload): HistorySharePayload {
  return Object.freeze({
    ...payload,
    visualCards: payload.visualCards.map((card) =>
      Object.freeze({ ...card }),
    ) as HistoryShareVisualCard[],
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
      visualCards.push({
        title: "Toplam Kalori",
        tone: "nutrition",
        layout: "summary",
        value: calories,
      });
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
      visualCards.push({
        title: "Toplam Hareket Süresi",
        tone: "activity",
        layout: "summary",
        value: duration,
      });
      lines.push(`Hareket: ${duration}`);
    }
    if (distance) lines.push(`Mesafe: ${distance}`);
    if (history.activity.entries.length > 0)
      lines.push(`Aktivite kaydı: ${history.activity.entries.length}`);
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
    kind: "normal",
    scope: "DAY",
    title: "Diewish • Gün Özeti",
    periodLabel: formatDateOnly(history.date),
    comparisonLabel: null,
    visualCards,
    sections,
    aiInsight: options.includeAiInsight ? matchingInsight(insight, "DAY") : null,
    footer: "Diewish ile günümü takip ediyorum • Yalnız seçtiğin kayıtlar paylaşılır",
  });
}

function observedNote(observed: ObservedNumber) {
  if (observed.state === "UNAVAILABLE") return "Veri şu anda alınamıyor.";
  if (observed.state === "NO_RECORD") return "Kayıt yok.";
  if (observed.state === "UNKNOWN" || !usable(observed)) return "Değer hesaplanamıyor.";
  return null;
}

function normalPeriodCard(
  title: string,
  description: string,
  tone: HistoryShareVisualTone,
  observed: ObservedNumber,
  format: ComparisonValueFormat,
  coverage: string,
  unit = "",
  digits = 0,
): HistoryShareVisualCard {
  return {
    title,
    description,
    tone,
    layout: "summary",
    value: comparisonValueText(observed, format, unit, digits),
    coverage,
    note: observedNote(observed),
  };
}

function summaryLine(card: HistoryShareVisualCard) {
  const note = card.note ? ` (${card.note.replace(/\.$/, "")})` : "";
  return `${card.title}: ${card.value ?? "—"}${note}`;
}

export function buildPeriodHistorySharePayload(
  comparison: HistoryComparisonResponse,
  options: HistoryShareOptions,
  insight: HistoryInsightResponse | null,
): HistorySharePayload {
  const visualCards: HistoryShareVisualCard[] = [];
  const sections: HistoryShareSection[] = [];
  const current = comparison.completeness.current;
  const week = comparison.periodType === "WEEK";

  const add = (sectionTitle: string, card: HistoryShareVisualCard) => {
    visualCards.push(card);
    const existing = sections.find((section) => section.title === sectionTitle);
    if (existing) existing.lines.push(summaryLine(card));
    else sections.push({ title: sectionTitle, lines: [summaryLine(card)] });
  };

  if (options.includeNutrition) {
    add(
      "Beslenme",
      normalPeriodCard(
        "Ortalama Kalori",
        "Besin değeri bulunan günlerin ortalaması.",
        "nutrition",
        comparison.metrics.nutrition.averageCaloriesPerQuantifiedDay.current,
        "number",
        coverageText(current.nutrition),
        " kcal",
      ),
    );
    add(
      "Beslenme",
      normalPeriodCard(
        "Ortalama Protein",
        "Besin değeri bulunan günlerin ortalaması.",
        "protein",
        comparison.metrics.nutrition.averageProteinGPerQuantifiedDay.current,
        "number",
        coverageText(current.nutrition),
        " g",
        1,
      ),
    );
  }

  if (options.includeWater) {
    add(
      "Su",
      normalPeriodCard(
        "Ortalama Su",
        "Su kaydı bulunan günlerin ortalaması.",
        "water",
        comparison.metrics.water.averageMlPerRecordedDay.current,
        "water",
        coverageText(current.water),
      ),
    );
  }

  if (options.includeActivity) {
    add(
      "Hareket",
      normalPeriodCard(
        "Toplam Aktivite Süresi",
        "Dönemde kaydedilen toplam süre.",
        "activity",
        comparison.metrics.activity.totalActiveMinutes.current,
        "duration",
        coverageText(current.activity),
      ),
    );
  }

  if (options.includeSleep) {
    add(
      "Uyku",
      normalPeriodCard(
        "Ortalama Uyku Süresi",
        "Kaydedilen gecelerin ortalaması.",
        "sleep",
        comparison.metrics.sleep.averageDurationPerRecordedNight.current,
        "duration",
        coverageText(current.sleep),
      ),
    );
  }

  if (options.includeWeight) {
    const measurementCount = current.weight.measurementCount;
    const weight = comparison.metrics.weight.netChangeKg.current;
    const note =
      current.weight.sourceStatus === "UNAVAILABLE"
        ? "Ölçüm verisi şu anda alınamıyor."
        : measurementCount === 0
          ? "Bu dönemde ölçüm yok."
          : measurementCount === 1
            ? "Bu dönemde 1 ölçüm; değişim hesaplanamıyor."
            : observedNote(weight);
    const card: HistoryShareVisualCard = {
      title: "Kilo Değişimi",
      description: "Dönem içindeki net değişim.",
      tone: "weight",
      layout: "summary",
      value: measurementCount >= 2 ? netWeightValueText(weight) : "—",
      coverage:
        current.weight.sourceStatus === "UNAVAILABLE"
          ? "Ölçüm alınamadı"
          : `${measurementCount} ölçüm`,
      note,
    };
    add("Kilo", card);
  }

  return freezePayload({
    kind: "normal",
    scope: comparison.periodType,
    title: week ? "Diewish • Haftanın Özeti" : "Diewish • Ayın Özeti",
    periodLabel: periodLabel(comparison),
    comparisonLabel: null,
    visualCards,
    sections,
    aiInsight: options.includeAiInsight ? matchingInsight(insight, comparison.periodType) : null,
    footer: "Diewish ile dönemimi takip ediyorum • Yalnız seçtiğin kayıtlar paylaşılır",
  });
}

function comparisonCard(
  title: string,
  description: string,
  tone: HistoryShareVisualTone,
  metric: MetricComparison,
  currentLabel: string,
  previousLabel: string,
  currentValue: string,
  previousValue: string,
  difference: string,
  coverage: string,
  note = comparisonMissingNote(metric),
): HistoryShareVisualCard {
  return {
    title,
    description,
    tone,
    layout: "comparison",
    currentLabel,
    currentValue,
    previousLabel,
    previousValue,
    difference,
    coverage,
    note,
  };
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

  const add = (card: HistoryShareVisualCard) => {
    visualCards.push(card);
    const lines = [
      `${card.currentLabel ?? "Bu dönem"}: ${card.currentValue ?? "—"}`,
      `${card.previousLabel ?? "Önceki dönem"}: ${card.previousValue ?? "—"}`,
      `Fark: ${card.difference ?? "—"}`,
    ];
    if (card.note) lines.push(card.note);
    sections.push({ title: card.title, lines });
  };

  if (options.includeNutrition) {
    const calories = comparison.metrics.nutrition.averageCaloriesPerQuantifiedDay;
    const protein = comparison.metrics.nutrition.averageProteinGPerQuantifiedDay;
    add(
      comparisonCard(
        "Ortalama Kalori",
        "Besin değeri bulunan günlerin ortalaması.",
        "nutrition",
        calories,
        currentLabel,
        previousLabel,
        comparisonValueText(calories.current, "number", " kcal"),
        comparisonValueText(calories.previous, "number", " kcal"),
        comparisonDeltaText(calories, "number", " kcal"),
        coverageText(comparison.completeness.current.nutrition),
      ),
    );
    add(
      comparisonCard(
        "Protein",
        "Besin değeri bulunan günlerin ortalaması.",
        "protein",
        protein,
        currentLabel,
        previousLabel,
        comparisonValueText(protein.current, "number", " g", 1),
        comparisonValueText(protein.previous, "number", " g", 1),
        comparisonDeltaText(protein, "number", " g", 1),
        coverageText(comparison.completeness.current.nutrition),
      ),
    );
  }

  if (options.includeWater) {
    const water = comparison.metrics.water.averageMlPerRecordedDay;
    add(
      comparisonCard(
        "Su",
        "Su kaydı bulunan günlerin ortalaması.",
        "water",
        water,
        currentLabel,
        previousLabel,
        comparisonValueText(water.current, "water"),
        comparisonValueText(water.previous, "water"),
        comparisonDeltaText(water, "water"),
        coverageText(comparison.completeness.current.water),
      ),
    );
  }

  if (options.includeActivity) {
    const activity = comparison.metrics.activity.totalActiveMinutes;
    add(
      comparisonCard(
        "Toplam Aktivite Süresi",
        "Dönemde kaydedilen toplam süre.",
        "activity",
        activity,
        currentLabel,
        previousLabel,
        comparisonValueText(activity.current, "duration"),
        comparisonValueText(activity.previous, "duration"),
        comparisonDeltaText(activity, "duration"),
        coverageText(comparison.completeness.current.activity),
      ),
    );
  }

  if (options.includeSleep) {
    const sleep = comparison.metrics.sleep.averageDurationPerRecordedNight;
    add(
      comparisonCard(
        "Ortalama Uyku Süresi",
        "Kaydedilen gecelerin ortalaması.",
        "sleep",
        sleep,
        currentLabel,
        previousLabel,
        comparisonValueText(sleep.current, "duration"),
        comparisonValueText(sleep.previous, "duration"),
        comparisonDeltaText(sleep, "duration"),
        coverageText(comparison.completeness.current.sleep),
      ),
    );
  }

  if (options.includeWeight) {
    const weight = comparison.metrics.weight.netChangeKg;
    const weightPresentation = weightComparisonPresentation(
      weight,
      comparison.completeness.current.weight.measurementCount,
      comparison.completeness.previous.weight.measurementCount,
    );
    add(
      comparisonCard(
        "Kilo Değişimi",
        "Dönem içindeki net değişim.",
        "weight",
        weight,
        currentLabel,
        previousLabel,
        weightPresentation.currentValue,
        weightPresentation.previousValue,
        weightPresentation.difference,
        `${comparison.completeness.current.weight.measurementCount} ölçüm`,
        weightPresentation.note,
      ),
    );
  }

  return freezePayload({
    kind: "comparison",
    scope: comparison.periodType,
    title: week ? "Diewish • Haftalık Karşılaştırma" : "Diewish • Aylık Karşılaştırma",
    periodLabel: periodLabel(comparison),
    comparisonLabel: week
      ? "Bu hafta ↔ Geçen haftanın aynı dönemi"
      : "Bu ay ↔ Geçen ayın aynı dönemi",
    visualCards,
    sections,
    aiInsight: options.includeAiInsight ? matchingInsight(insight, comparison.periodType) : null,
    footer: "Diewish • Yalnız seçtiğin kayıtlar paylaşılır",
  });
}
