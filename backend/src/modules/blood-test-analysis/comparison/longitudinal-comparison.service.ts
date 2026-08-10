import { logger } from "../../../lib/logger";
import { bloodTestAnalysisRepository } from "../blood-test-analysis.repository";
import type { NormalizedBloodTestValue } from "../types";

/**
 * Longitudinal Blood-Test Comparison (Sprint 21.1).
 *
 * Prepares a purely numeric, structured comparison between the user's CURRENT
 * normalized biomarker values and those from their most recent PREVIOUS
 * completed analysis. It exists so Medical AI can consume the trend data later —
 * this module itself produces NO medical interpretation, changes no AI prompts,
 * and never touches OCR, extraction, validation or enhancement.
 *
 * Only biomarkers present (with a usable numeric value) in BOTH analyses are
 * compared. When there is no previous analysis or no overlap, the builder
 * returns `null`.
 */

/** The trend direction of a single biomarker between two analyses. */
export type ComparisonDirection = "increased" | "decreased" | "unchanged";

/** A single biomarker's numeric change between two analyses. */
export interface BiomarkerComparison {
  readonly biomarkerCode: string;
  readonly biomarkerName: string;
  /** Canonical unit both values are expressed in. */
  readonly unit: string;
  /** Value from the previous analysis. */
  readonly previousValue: number;
  /** Value from the current analysis. */
  readonly currentValue: number;
  /** `currentValue - previousValue`, rounded to 4 decimals. */
  readonly absoluteDifference: number;
  /**
   * Percentage change relative to the previous value, rounded to 2 decimals.
   * `null` when the previous value is 0 (percentage undefined).
   */
  readonly percentageDifference: number | null;
  /** Direction of change. */
  readonly direction: ComparisonDirection;
}

/** The full structured comparison object handed downstream. */
export interface LongitudinalComparison {
  /** Id of the previous analysis used as the baseline. */
  readonly previousAnalysisId: string;
  /** ISO timestamp of the previous analysis. */
  readonly previousAnalysisDate: string;
  /** Number of biomarkers compared (present in both analyses). */
  readonly comparedCount: number;
  /** The per-biomarker comparisons, in current-analysis order. */
  readonly comparisons: BiomarkerComparison[];
}

/** Rounds a number to a fixed number of decimal places. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** True when a normalized value carries a usable, finite numeric reading. */
function hasNumericValue(
  value: NormalizedBloodTestValue,
): value is NormalizedBloodTestValue & { numericValue: number } {
  return typeof value.numericValue === "number" && Number.isFinite(value.numericValue);
}

/**
 * Computes the structured comparison between two sets of normalized values.
 * Pure and side-effect free. Only biomarkers with a usable numeric value in
 * BOTH sets are compared. Returns `null` when there is no overlap.
 *
 * @param currentValues - Current analysis normalized values.
 * @param previousValues - Previous analysis normalized values.
 * @param previous - Metadata about the previous analysis (id + date).
 */
export function buildComparison(
  currentValues: readonly NormalizedBloodTestValue[],
  previousValues: readonly NormalizedBloodTestValue[],
  previous: { id: string; date: string },
): LongitudinalComparison | null {
  const previousByCode = new Map<string, number>();
  for (const value of previousValues) {
    if (hasNumericValue(value)) previousByCode.set(value.biomarkerCode, value.numericValue);
  }
  if (previousByCode.size === 0) return null;

  const comparisons: BiomarkerComparison[] = [];
  const seen = new Set<string>();

  for (const value of currentValues) {
    if (!hasNumericValue(value)) continue;
    if (seen.has(value.biomarkerCode)) continue;
    const previousValue = previousByCode.get(value.biomarkerCode);
    if (previousValue === undefined) continue;
    seen.add(value.biomarkerCode);

    const currentValue = value.numericValue;
    const absoluteDifference = round(currentValue - previousValue, 4);
    const percentageDifference =
      previousValue === 0 ? null : round(((currentValue - previousValue) / previousValue) * 100, 2);
    const direction: ComparisonDirection =
      absoluteDifference > 0 ? "increased" : absoluteDifference < 0 ? "decreased" : "unchanged";

    comparisons.push({
      biomarkerCode: value.biomarkerCode,
      biomarkerName: value.biomarkerName,
      unit: value.unit,
      previousValue,
      currentValue,
      absoluteDifference,
      percentageDifference,
      direction,
    });
  }

  if (comparisons.length === 0) return null;

  return {
    previousAnalysisId: previous.id,
    previousAnalysisDate: previous.date,
    comparedCount: comparisons.length,
    comparisons,
  };
}

export const longitudinalComparisonService = {
  /**
   * Builds the longitudinal comparison for a user by locating their most recent
   * previous COMPLETED analysis (excluding the current one) and comparing its
   * stored normalized values against the supplied current values.
   *
   * @param userId - Owner id.
   * @param currentAnalysisId - The analysis currently being processed (excluded
   *   from the baseline search).
   * @param currentValues - The current analysis normalized values.
   * @returns The structured comparison, or `null` when no prior analysis exists
   *   or there are no matching biomarkers.
   */
  async buildForUser(
    userId: string,
    currentAnalysisId: string,
    currentValues: readonly NormalizedBloodTestValue[],
  ): Promise<LongitudinalComparison | null> {
    try {
      const analyses = await bloodTestAnalysisRepository.listByUser(userId);
      const previous = analyses.find(
        (a) => a.id !== currentAnalysisId && a.status === "COMPLETED",
      );
      if (!previous) return null;

      const previousValues = (previous.normalizedValues ??
        []) as unknown as NormalizedBloodTestValue[];
      if (!Array.isArray(previousValues) || previousValues.length === 0) return null;

      return buildComparison(currentValues, previousValues, {
        id: previous.id,
        date: previous.createdAt.toISOString(),
      });
    } catch (error) {
      // Advisory-only data prep — never fail the analysis over it.
      logger.warn({ err: error, userId }, "Longitudinal comparison preparation failed");
      return null;
    }
  },
};
