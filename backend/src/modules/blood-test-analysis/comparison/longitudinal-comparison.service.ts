import { logger } from "../../../lib/logger";
import {
  bloodTestAnalysisRepository,
  type BloodTestAnalysisComparisonRow,
} from "../blood-test-analysis.repository";
import type {
  BloodTestValueStatus,
  NormalizedBloodTestValue,
} from "../types";

/**
 * Numeric, owner-scoped longitudinal comparison derived from persisted
 * normalized blood-test values. This module never infers diagnosis, treatment
 * effect or causal improvement; direction is mathematical only.
 */
export type ComparisonDirection = "increased" | "decreased" | "unchanged";

export type ComparisonReferenceStatus = BloodTestValueStatus;

export interface BiomarkerComparison {
  readonly biomarkerCode: string;
  readonly biomarkerName: string;
  readonly unit: string;
  readonly previousValue: number;
  readonly currentValue: number;
  readonly absoluteDifference: number;
  readonly percentageDifference: number | null;
  readonly direction: ComparisonDirection;
  readonly previousReferenceStatus: ComparisonReferenceStatus;
  readonly currentReferenceStatus: ComparisonReferenceStatus;
}

export interface LongitudinalComparison {
  readonly previousAnalysisId: string;
  /** Real laboratory test date, never analysis creation time. */
  readonly previousMeasuredAt: string | null;
  /** Real laboratory test date, never analysis creation time. */
  readonly currentMeasuredAt: string | null;
  readonly comparedCount: number;
  /** Comparisons remain in first-seen current-analysis order. */
  readonly comparisons: BiomarkerComparison[];
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function hasNumericValue(
  value: NormalizedBloodTestValue,
): value is NormalizedBloodTestValue & { numericValue: number } {
  return typeof value.numericValue === "number" && Number.isFinite(value.numericValue);
}

function measuredDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function safeReferenceStatus(value: NormalizedBloodTestValue): ComparisonReferenceStatus {
  return value.referenceRange?.source === "LAB_REPORT" ? value.status : "UNKNOWN";
}

function firstByBiomarkerCode(
  values: readonly NormalizedBloodTestValue[],
): Map<string, NormalizedBloodTestValue> {
  const byCode = new Map<string, NormalizedBloodTestValue>();
  for (const value of values) {
    if (!byCode.has(value.biomarkerCode)) {
      byCode.set(value.biomarkerCode, value);
    }
  }
  return byCode;
}

/**
 * Pure comparison builder. Matching is exact canonical biomarkerCode only.
 * No fuzzy/alias matching or unit conversion is performed here.
 */
export function buildComparison(
  currentValues: readonly NormalizedBloodTestValue[],
  previousValues: readonly NormalizedBloodTestValue[],
  previous: { id: string; measuredAt: Date | null },
  current: { measuredAt: Date | null },
): LongitudinalComparison | null {
  const previousByCode = firstByBiomarkerCode(previousValues);
  const comparisons: BiomarkerComparison[] = [];
  const seenCurrent = new Set<string>();

  for (const currentValueRecord of currentValues) {
    if (seenCurrent.has(currentValueRecord.biomarkerCode)) continue;
    seenCurrent.add(currentValueRecord.biomarkerCode);

    const previousValueRecord = previousByCode.get(currentValueRecord.biomarkerCode);
    if (!previousValueRecord) continue;
    if (!hasNumericValue(currentValueRecord) || !hasNumericValue(previousValueRecord)) continue;

    // Normalization should already canonicalize units. If persisted records do
    // not agree, fail closed instead of inventing a medical/unit conversion.
    if (currentValueRecord.unit.trim() !== previousValueRecord.unit.trim()) continue;

    const previousValue = previousValueRecord.numericValue;
    const currentValue = currentValueRecord.numericValue;
    const absoluteDifference = round(currentValue - previousValue, 4);
    const percentageDifference =
      previousValue === 0
        ? null
        : round(((currentValue - previousValue) / previousValue) * 100, 2);
    const direction: ComparisonDirection =
      absoluteDifference > 0
        ? "increased"
        : absoluteDifference < 0
          ? "decreased"
          : "unchanged";

    comparisons.push({
      biomarkerCode: currentValueRecord.biomarkerCode,
      biomarkerName: currentValueRecord.biomarkerName,
      unit: currentValueRecord.unit,
      previousValue,
      currentValue,
      absoluteDifference,
      percentageDifference,
      direction,
      previousReferenceStatus: safeReferenceStatus(previousValueRecord),
      currentReferenceStatus: safeReferenceStatus(currentValueRecord),
    });
  }

  if (comparisons.length === 0) return null;

  return {
    previousAnalysisId: previous.id,
    previousMeasuredAt: measuredDate(previous.measuredAt),
    currentMeasuredAt: measuredDate(current.measuredAt),
    comparedCount: comparisons.length,
    comparisons,
  };
}

/**
 * Selects the previous baseline deterministically.
 *
 * When the current test date is known, only dated tests that are not in the
 * future can be baselines. Same-day tests use analysis creation order as the
 * tie-breaker. When the current test date is unknown, legacy analysis creation
 * order is used only for baseline selection; it is never exposed as measuredAt.
 */
export function selectPreviousAnalysis(
  analyses: readonly BloodTestAnalysisComparisonRow[],
  currentAnalysisId: string,
  currentMeasuredAt: Date | null,
  currentCreatedAt: Date,
): BloodTestAnalysisComparisonRow | null {
  const candidates = analyses.filter((analysis) => {
    if (analysis.id === currentAnalysisId) return false;

    if (currentMeasuredAt) {
      const testDate = analysis.bloodTest.testDate;
      if (!testDate) return false;
      const delta = testDate.getTime() - currentMeasuredAt.getTime();
      if (delta < 0) return true;
      return delta === 0 && analysis.createdAt.getTime() < currentCreatedAt.getTime();
    }

    return analysis.createdAt.getTime() < currentCreatedAt.getTime();
  });

  candidates.sort((left, right) => {
    if (currentMeasuredAt) {
      const dateDelta =
        (right.bloodTest.testDate?.getTime() ?? 0) -
        (left.bloodTest.testDate?.getTime() ?? 0);
      if (dateDelta !== 0) return dateDelta;
    }

    const createdDelta = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdDelta !== 0) return createdDelta;
    return left.id.localeCompare(right.id);
  });

  return candidates[0] ?? null;
}

export const longitudinalComparisonService = {
  async buildForUser(
    userId: string,
    currentAnalysisId: string,
    currentValues: readonly NormalizedBloodTestValue[],
    currentMeasuredAt: Date | null,
    currentCreatedAt: Date,
  ): Promise<LongitudinalComparison | null> {
    try {
      const analyses =
        await bloodTestAnalysisRepository.listCompletedForComparisonByUser(userId);
      const previous = selectPreviousAnalysis(
        analyses,
        currentAnalysisId,
        currentMeasuredAt,
        currentCreatedAt,
      );
      if (!previous) return null;

      const previousValues = previous.normalizedValues;
      if (!Array.isArray(previousValues) || previousValues.length === 0) return null;

      return buildComparison(
        currentValues,
        previousValues as unknown as NormalizedBloodTestValue[],
        {
          id: previous.id,
          measuredAt: previous.bloodTest.testDate,
        },
        { measuredAt: currentMeasuredAt },
      );
    } catch (error) {
      // Comparison is advisory. Failure must not convert a valid analysis into
      // FAILED, and returning null avoids silent partial/corrupt trend data.
      logger.warn({ err: error, userId }, "Longitudinal comparison preparation failed");
      return null;
    }
  },
};
