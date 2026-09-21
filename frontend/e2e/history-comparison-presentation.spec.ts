import { expect, test } from "@playwright/test";

import type { MetricComparison, ObservedNumber } from "../src/domain/history/types";
import {
  comparisonDeltaText,
  comparisonMissingNote,
  comparisonValueText,
  weightComparisonPresentation,
} from "../src/presentation/components/history/history-comparison-presentation";

function observed(state: ObservedNumber["state"], value: number | null): ObservedNumber {
  return { state, value };
}

function metric(
  current: ObservedNumber,
  previous: ObservedNumber,
  absoluteChange: number | null,
): MetricComparison {
  return {
    current,
    previous,
    absoluteChange,
    percentageChange: null,
    direction:
      absoluteChange === null
        ? "UNAVAILABLE"
        : absoluteChange > 0
          ? "UP"
          : absoluteChange < 0
            ? "DOWN"
            : "UNCHANGED",
    comparisonAvailable: absoluteChange !== null,
    quality: absoluteChange === null ? "NONE" : "FULL",
  };
}

test("comparison durations use readable Turkish hour and minute values", () => {
  expect(comparisonValueText(observed("KNOWN_VALUE", 990), "duration")).toBe("16 sa 30 dk");
  expect(comparisonValueText(observed("KNOWN_VALUE", 480), "duration")).toBe("8 sa");
  expect(comparisonValueText(observed("KNOWN_VALUE", 200), "duration")).toBe("3 sa 20 dk");
  expect(
    comparisonDeltaText(
      metric(observed("KNOWN_VALUE", 200), observed("KNOWN_VALUE", 70), 130),
      "duration",
    ),
  ).toBe("+2 sa 10 dk");
  expect(
    comparisonDeltaText(
      metric(observed("KNOWN_VALUE", 25), observed("KNOWN_VALUE", 70), -45),
      "duration",
    ),
  ).toBe("−45 dk");
});

test("known previous zero remains zero and keeps an absolute delta", () => {
  const calories = metric(observed("KNOWN_VALUE", 60), observed("KNOWN_ZERO", 0), 60);
  expect(comparisonValueText(calories.previous, "number", " kcal")).toBe("0 kcal");
  expect(comparisonDeltaText(calories, "number", " kcal")).toBe("+60 kcal");
});

test("no-record values stay missing and explain why comparison is unavailable", () => {
  const calories = metric(observed("KNOWN_VALUE", 165), observed("NO_RECORD", null), null);
  expect(comparisonValueText(calories.previous, "number", " kcal")).toBe("—");
  expect(comparisonValueText(observed("NO_RECORD", 0), "number", " kcal")).toBe("—");
  expect(comparisonDeltaText(calories, "number", " kcal")).toBe("—");
  expect(comparisonMissingNote(calories)).toBe("Geçen dönemde kayıt yok.");
});

test("one weight measurement never becomes a fabricated net change", () => {
  const weight = metric(observed("NO_RECORD", null), observed("KNOWN_ZERO", 0), null);
  const presentation = weightComparisonPresentation(weight, 1, 2);
  expect(presentation.currentValue).toBe("—");
  expect(presentation.difference).toBe("—");
  expect(presentation.note).toBe("Bu dönemde 1 ölçüm; değişim hesaplanamıyor.");
});

test("weight net changes keep explicit direction without changing domain semantics", () => {
  const weight = metric(observed("KNOWN_VALUE", 2), observed("KNOWN_ZERO", 0), 2);
  const presentation = weightComparisonPresentation(weight, 2, 2);
  expect(presentation.currentValue).toBe("+2 kg");
  expect(presentation.previousValue).toBe("0 kg");
  expect(presentation.difference).toBe("+2 kg");
  expect(presentation.note).toBe("Bu dönemde kilo artışı kaydedildi.");
});

test("non-finite presentation values never render NaN or Infinity", () => {
  const invalid = metric(
    observed("KNOWN_VALUE", Number.NaN),
    observed("KNOWN_VALUE", Number.POSITIVE_INFINITY),
    Number.NaN,
  );
  const rendered = [
    comparisonValueText(invalid.current, "number", " g", 1),
    comparisonValueText(invalid.previous, "water"),
    comparisonDeltaText(invalid, "number", " g", 1),
    comparisonMissingNote(invalid),
  ].join(" ");
  expect(rendered).not.toContain("NaN");
  expect(rendered).not.toContain("Infinity");
});
