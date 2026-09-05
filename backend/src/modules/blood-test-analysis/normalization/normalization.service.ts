import type { BloodTestReferenceRange } from "@prisma/client";

import type {
  BloodTestValueStatus,
  ExtractedBloodTestValue,
  NormalizedBloodTestValue,
  ReferenceRangeSnapshot,
} from "../types";
import { getBiomarkerDefinition, matchBiomarkerCode } from "./biomarker-aliases.map";
import { convertUnit } from "./unit-converter";

/** A lookup of active reference ranges keyed by canonical biomarker code. */
export type ReferenceRangeMap = Map<string, BloodTestReferenceRange>;

/**
 * Parses a raw value string (e.g. "1,200", "5.4", "<0.5", "> 200") into a
 * finite number, or `null` when it cannot be interpreted.
 */
function parseNumeric(raw: string): number | null {
  let cleaned = raw.replace(/[<>≥≤]/g, "").replace(/\s+/g, "").trim();
  if (!cleaned) return null;

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");
  if (hasDot && hasComma) {
    // Assume comma is a thousands separator.
    cleaned = cleaned.replace(/,/g, "");
  } else if (hasComma && !hasDot) {
    // Assume comma is the decimal separator.
    cleaned = cleaned.replace(/,/g, ".");
  }

  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parses the laboratory's own printed reference range. The report range has
 * priority over Diewish's generic database fallback because it is tied to the
 * exact laboratory/method used for the uploaded result.
 */
function parseDocumentReferenceRange(
  raw: string | undefined,
  unit: string | null,
): ReferenceRangeSnapshot | null {
  if (!raw?.trim() || !unit?.trim()) return null;
  const text = raw.trim().replace(/\s+/g, " ");
  const number = "[-+]?\\d+(?:[.,]\\d+)?";

  const interval = text.match(new RegExp(`(${number})\\s*[-–—]\\s*(${number})`));
  if (interval) {
    const minValue = parseNumeric(interval[1]);
    const maxValue = parseNumeric(interval[2]);
    if (minValue !== null && maxValue !== null) {
      return {
        unit,
        minValue: Math.min(minValue, maxValue),
        maxValue: Math.max(minValue, maxValue),
        optimalMin: null,
        optimalMax: null,
        source: "LAB_REPORT",
      };
    }
  }

  const upper = text.match(new RegExp(`(?:<=|<|≤)\\s*(${number})`));
  if (upper) {
    const maxValue = parseNumeric(upper[1]);
    if (maxValue !== null) {
      return {
        unit,
        minValue: null,
        maxValue,
        optimalMin: null,
        optimalMax: null,
        source: "LAB_REPORT",
      };
    }
  }

  const lower = text.match(new RegExp(`(?:>=|>|≥)\\s*(${number})`));
  if (lower) {
    const minValue = parseNumeric(lower[1]);
    if (minValue !== null) {
      return {
        unit,
        minValue,
        maxValue: null,
        optimalMin: null,
        optimalMax: null,
        source: "LAB_REPORT",
      };
    }
  }

  return null;
}

/**
 * Computes a value's status relative to a reference range. "Critical" is
 * defined as being at least half a range-width beyond the normal bounds; when
 * only one bound exists, a proportional margin is used.
 */
function computeStatus(
  value: number,
  min: number | null,
  max: number | null,
): BloodTestValueStatus {
  if (min === null && max === null) return "UNKNOWN";

  const width = min !== null && max !== null ? Math.abs(max - min) : null;

  if (min !== null && value < min) {
    const criticalLow = width !== null ? min - width * 0.5 : min * 0.5;
    return value <= criticalLow ? "CRITICALLY_LOW" : "LOW";
  }
  if (max !== null && value > max) {
    const criticalHigh = width !== null ? max + width * 0.5 : max * 1.5;
    return value >= criticalHigh ? "CRITICALLY_HIGH" : "HIGH";
  }
  return "NORMAL";
}

/** Builds the persisted snapshot of a database reference range. */
function toSnapshot(range: BloodTestReferenceRange): ReferenceRangeSnapshot {
  return {
    unit: range.unit,
    minValue: range.minValue,
    maxValue: range.maxValue,
    optimalMin: range.optimalMin,
    optimalMax: range.optimalMax,
    source: range.source,
  };
}

/**
 * Normalizes raw extracted laboratory values into the structured, reference
 * compared form consumed by the analysis engine and downstream features.
 */
export const normalizationService = {
  /**
   * Normalizes a batch of extracted values against the report's own range first
   * and then the database fallback.
   *
   * For each value it: matches the label to a canonical code, parses the
   * numeric value, selects a safe reference range, converts the unit when a DB
   * fallback requires it, and computes the status. Values whose label cannot be
   * matched are still returned with an `UNKNOWN` status so nothing is silently
   * dropped.
   *
   * @param extracted - Raw values from the extraction pipeline.
   * @param ranges - Active fallback reference ranges keyed by canonical code.
   * @returns The normalized values.
   */
  normalize(
    extracted: ExtractedBloodTestValue[],
    ranges: ReferenceRangeMap,
  ): NormalizedBloodTestValue[] {
    const results: NormalizedBloodTestValue[] = [];

    for (const item of extracted) {
      const code = matchBiomarkerCode(item.name);
      const definition = code ? getBiomarkerDefinition(code) : undefined;
      const databaseRange = code ? (ranges.get(code) ?? null) : null;
      const extractedUnit = item.unit?.trim() || null;
      const documentRange = parseDocumentReferenceRange(item.referenceRange, extractedUnit);
      const referenceRange = documentRange ?? (databaseRange ? toSnapshot(databaseRange) : null);

      const parsed = parseNumeric(item.rawValue);
      const targetUnit =
        referenceRange?.unit ?? definition?.canonicalUnit ?? extractedUnit ?? "";

      let numericValue = parsed;
      let conversionFactor = 1;
      if (parsed !== null && code && targetUnit) {
        const conversion = convertUnit(code, parsed, extractedUnit, targetUnit);
        if (conversion) {
          numericValue = conversion.value;
          conversionFactor = conversion.factor;
        }
      }

      let status: BloodTestValueStatus = "UNKNOWN";
      if (numericValue !== null && referenceRange) {
        status = computeStatus(
          numericValue,
          referenceRange.minValue,
          referenceRange.maxValue,
        );
      }

      results.push({
        biomarkerCode: code ?? item.name.trim().toUpperCase().replace(/\s+/g, "_"),
        biomarkerName: definition?.name ?? item.name.trim(),
        rawValue: item.rawValue,
        numericValue,
        unit: targetUnit,
        extractedUnit,
        conversionFactor,
        referenceRange,
        status,
      });
    }

    return results;
  },
};
