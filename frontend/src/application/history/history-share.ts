import type {
  DailyHistoryResponse,
  HistoryComparisonResponse,
  HistoryInsightResponse,
  ObservedNumber,
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

export interface HistorySharePayload {
  scope: "DAY" | "WEEK" | "MONTH";
  title: string;
  periodLabel: string;
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

function value(observed: ObservedNumber, unit: string, digits = 0): string | null {
  if (observed.value === null) return null;
  if (observed.state === "UNAVAILABLE" || observed.state === "NO_RECORD" || observed.state === "UNKNOWN") {
    return null;
  }
  return `${observed.value.toLocaleString("tr-TR", {
    maximumFractionDigits: digits,
  })}${unit}`;
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

function pushIf(lines: string[], label: string, observed: ObservedNumber, unit: string, digits = 0): void {
  const formatted = value(observed, unit, digits);
  if (formatted) lines.push(`${label}: ${formatted}`);
}

export function buildDailyHistorySharePayload(
  history: DailyHistoryResponse,
  options: HistoryShareOptions,
  insight: HistoryInsightResponse | null,
): HistorySharePayload {
  const sections: HistoryShareSection[] = [];

  if (options.includeNutrition && history.nutrition.sourceStatus === "OK") {
    const lines: string[] = [];
    pushIf(lines, "Kalori", history.nutrition.totals.calories, " kcal");
    pushIf(lines, "Protein", history.nutrition.totals.proteinG, " g", 1);
    pushIf(lines, "Karbonhidrat", history.nutrition.totals.carbsG, " g", 1);
    pushIf(lines, "Yağ", history.nutrition.totals.fatG, " g", 1);

    if (options.includeMealNames) {
      const names = history.nutrition.meals
        .flatMap((meal) => meal.items.map((item) => item.name))
        .filter((name): name is string => Boolean(name?.trim()));
      if (names.length > 0) lines.push(`Öğünler: ${names.join(", ")}`);
    }

    if (lines.length > 0) sections.push({ title: "Beslenme", lines });
  }

  if (options.includeWater && history.water.sourceStatus === "OK") {
    const lines: string[] = [];
    pushIf(lines, "Kaydedilen su", history.water.totalMl, " ml");
    if (lines.length > 0) sections.push({ title: "Su", lines });
  }

  if (options.includeActivity && history.activity.sourceStatus === "OK") {
    const lines: string[] = [];
    pushIf(lines, "Aktif süre", history.activity.totalActiveMinutes, " dk");
    pushIf(lines, "Mesafe", history.activity.totalDistanceKm, " km", 1);
    if (history.activity.entries.length > 0) {
      lines.push(`Aktivite kaydı: ${history.activity.entries.length}`);
    }
    if (lines.length > 0) sections.push({ title: "Aktivite", lines });
  }

  if (options.includeSleep && history.sleep.sourceStatus === "OK") {
    const lines: string[] = [];
    pushIf(lines, "Uyku", history.sleep.totalDurationMinutes, " dk");
    if (lines.length > 0) sections.push({ title: "Uyku", lines });
  }

  if (options.includeWeight && history.weight.measurement) {
    sections.push({
      title: "Kilo",
      lines: [`${history.weight.measurement.weightKg.toLocaleString("tr-TR", {
        maximumFractionDigits: 1,
      })} kg`],
    });
  }

  return Object.freeze({
    scope: "DAY" as const,
    title: "Diewish • Günlük Geçmiş",
    periodLabel: formatDateOnly(history.date),
    sections: sections.map((section) =>
      Object.freeze({ title: section.title, lines: Object.freeze([...section.lines]) as unknown as string[] }),
    ),
    aiInsight: options.includeAiInsight ? insight?.content.text ?? null : null,
    footer: "Yalnız seçtiğin kayıtlar paylaşılır • Diewish",
  });
}

function comparisonValue(metric: {
  current: ObservedNumber;
  previous: ObservedNumber;
  absoluteChange: number | null;
  percentageChange: number | null;
  direction: string;
  comparisonAvailable: boolean;
}, unit: string, digits = 0): string | null {
  const current = value(metric.current, unit, digits);
  if (!current) return null;
  if (!metric.comparisonAvailable || metric.absoluteChange === null) return `Bu dönem: ${current}`;
  const change = metric.absoluteChange.toLocaleString("tr-TR", {
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  });
  return `Bu dönem: ${current} • fark: ${change}${unit}`;
}

export function buildComparisonHistorySharePayload(
  comparison: HistoryComparisonResponse,
  options: HistoryShareOptions,
  insight: HistoryInsightResponse | null,
): HistorySharePayload {
  const sections: HistoryShareSection[] = [];

  if (options.includeNutrition) {
    const lines = [
      comparisonValue(comparison.metrics.nutrition.averageCaloriesPerQuantifiedDay, " kcal"),
      comparisonValue(comparison.metrics.nutrition.averageProteinGPerQuantifiedDay, " g", 1),
    ].filter((line): line is string => Boolean(line));
    if (lines.length > 0) sections.push({ title: "Beslenme", lines });
  }

  if (options.includeWater) {
    const lines = [
      comparisonValue(comparison.metrics.water.totalMl, " ml"),
      comparisonValue(comparison.metrics.water.averageMlPerRecordedDay, " ml"),
    ].filter((line): line is string => Boolean(line));
    if (lines.length > 0) sections.push({ title: "Su", lines });
  }

  if (options.includeActivity) {
    const lines = [
      comparisonValue(comparison.metrics.activity.totalActiveMinutes, " dk"),
      comparisonValue(comparison.metrics.activity.totalDistanceKm, " km", 1),
    ].filter((line): line is string => Boolean(line));
    if (lines.length > 0) sections.push({ title: "Aktivite", lines });
  }

  if (options.includeSleep) {
    const lines = [
      comparisonValue(comparison.metrics.sleep.averageDurationPerRecordedNight, " dk"),
    ].filter((line): line is string => Boolean(line));
    if (lines.length > 0) sections.push({ title: "Uyku", lines });
  }

  if (options.includeWeight) {
    const lines = [
      comparisonValue(comparison.metrics.weight.netChangeKg, " kg", 1),
    ].filter((line): line is string => Boolean(line));
    if (lines.length > 0) sections.push({ title: "Kilo değişimi", lines });
  }

  const label =
    comparison.currentPeriod.localStartDate === comparison.currentPeriod.localEndDateInclusive
      ? formatDateOnly(comparison.currentPeriod.localStartDate)
      : `${formatDateOnly(comparison.currentPeriod.localStartDate)} – ${formatDateOnly(
          comparison.currentPeriod.localEndDateInclusive,
        )}`;

  return Object.freeze({
    scope: comparison.periodType,
    title:
      comparison.periodType === "WEEK"
        ? "Diewish • Haftalık Geçmiş"
        : "Diewish • Aylık Geçmiş",
    periodLabel: label,
    sections: sections.map((section) =>
      Object.freeze({ title: section.title, lines: Object.freeze([...section.lines]) as unknown as string[] }),
    ),
    aiInsight: options.includeAiInsight ? insight?.content.text ?? null : null,
    footer: "Yalnız seçtiğin kayıtlar paylaşılır • Diewish",
  });
}
