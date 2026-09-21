import type { MetricComparison, ObservedNumber } from "@/domain/history/types";

export type ComparisonValueFormat = "number" | "water" | "duration" | "weight";

function finiteValue(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function presentValue(observed: ObservedNumber): observed is ObservedNumber & { value: number } {
  return (
    (observed.state === "KNOWN_ZERO" ||
      observed.state === "KNOWN_VALUE" ||
      observed.state === "PARTIAL_VALUE") &&
    finiteValue(observed.value)
  );
}

function numberText(value: number, digits = 0) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("tr-TR", { maximumFractionDigits: digits });
}

function durationText(minutes: number) {
  if (!Number.isFinite(minutes)) return "—";
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} dk`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} sa` : `${hours} sa ${rest} dk`;
}

function absoluteValueText(value: number, format: ComparisonValueFormat, unit = "", digits = 0) {
  if (format === "duration") return durationText(value);
  if (format === "water") {
    return value >= 1000 ? `${numberText(value / 1000, 1)} L` : `${numberText(value)} ml`;
  }
  if (format === "weight") return `${numberText(value, 1)} kg`;
  return `${numberText(value, digits)}${unit}`;
}

export function comparisonValueText(
  observed: ObservedNumber,
  format: ComparisonValueFormat,
  unit = "",
  digits = 0,
) {
  if (!presentValue(observed)) return "—";
  const text = absoluteValueText(observed.value, format, unit, digits);
  if (text === "—") return text;
  return observed.state === "PARTIAL_VALUE" ? `≥ ${text}` : text;
}

export function comparisonDeltaText(
  metric: MetricComparison,
  format: ComparisonValueFormat,
  unit = "",
  digits = 0,
) {
  if (
    !metric.comparisonAvailable ||
    !finiteValue(metric.absoluteChange) ||
    !presentValue(metric.current) ||
    !presentValue(metric.previous)
  ) {
    return "—";
  }

  if (metric.absoluteChange === 0) {
    return absoluteValueText(0, format, unit, digits);
  }

  return `${metric.absoluteChange > 0 ? "+" : "−"}${absoluteValueText(
    Math.abs(metric.absoluteChange),
    format,
    unit,
    digits,
  )}`;
}

function netWeightValueText(observed: ObservedNumber) {
  if (!presentValue(observed)) return "—";
  const sign = observed.value > 0 ? "+" : observed.value < 0 ? "−" : "";
  const text = `${sign}${absoluteValueText(Math.abs(observed.value), "weight")}`;
  return observed.state === "PARTIAL_VALUE" ? `≥ ${text}` : text;
}

function missingReason(observed: ObservedNumber, label: string) {
  if (observed.state === "UNAVAILABLE") return `${label} verisi şu anda alınamıyor.`;
  if (observed.state === "NO_RECORD") return `${label} kayıt yok.`;
  if (observed.state === "UNKNOWN" || !finiteValue(observed.value)) {
    return `${label} değer hesaplanamıyor.`;
  }
  return null;
}

export function comparisonMissingNote(metric: MetricComparison) {
  const currentReason = missingReason(metric.current, "Bu dönemde");
  const previousReason = missingReason(metric.previous, "Geçen dönemde");
  if (currentReason && previousReason) return "Karşılaştırma için yeterli kayıt yok.";
  if (currentReason) return currentReason;
  if (previousReason) return previousReason;
  if (!metric.comparisonAvailable || !finiteValue(metric.absoluteChange)) {
    return "Karşılaştırma için yeterli kayıt yok.";
  }
  return null;
}

export function weightComparisonPresentation(
  metric: MetricComparison,
  currentMeasurements: number,
  previousMeasurements: number,
) {
  const currentAvailable = currentMeasurements >= 2 && presentValue(metric.current);
  const previousAvailable = previousMeasurements >= 2 && presentValue(metric.previous);
  const differenceAvailable =
    currentAvailable &&
    previousAvailable &&
    metric.comparisonAvailable &&
    finiteValue(metric.absoluteChange);

  let note: string | null = null;
  if (currentMeasurements === 1) {
    note = "Bu dönemde 1 ölçüm; değişim hesaplanamıyor.";
  } else if (currentMeasurements === 0) {
    note = "Bu dönemde ölçüm yok.";
  } else if (previousMeasurements === 1) {
    note = "Geçen dönemde 1 ölçüm; karşılaştırma hesaplanamıyor.";
  } else if (previousMeasurements === 0) {
    note = "Geçen dönemde ölçüm yok.";
  } else if (!differenceAvailable) {
    note = comparisonMissingNote(metric);
  } else if ((metric.current.value ?? 0) > 0) {
    note = "Bu dönemde kilo artışı kaydedildi.";
  } else if ((metric.current.value ?? 0) < 0) {
    note = "Bu dönemde kilo azalışı kaydedildi.";
  } else {
    note = "Bu dönemde kilo değişimi kaydedilmedi.";
  }

  return {
    currentValue: currentAvailable ? netWeightValueText(metric.current) : "—",
    previousValue: previousAvailable ? netWeightValueText(metric.previous) : "—",
    difference: differenceAvailable ? comparisonDeltaText(metric, "weight") : "—",
    note,
  };
}
