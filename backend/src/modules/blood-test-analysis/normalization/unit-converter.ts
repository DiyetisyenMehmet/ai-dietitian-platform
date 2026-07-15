/**
 * Unit conversion for blood-test biomarkers.
 *
 * Different labs report the same biomarker in different units (most commonly
 * SI `mmol/L` vs. conventional `mg/dL`). To compare a value against a stored
 * reference range, the extracted unit must be converted to the range's unit.
 * Conversions are biomarker-specific because the molar mass differs per analyte.
 */

/** Result of a unit conversion attempt. */
export interface UnitConversion {
  /** Converted numeric value expressed in the target unit. */
  value: number;
  /** Multiplicative factor applied (targetValue = sourceValue * factor). */
  factor: number;
}

/** Canonicalizes a unit string for comparison (lower-case, strip spaces). */
function canon(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/µ/g, "u")
    .replace(/μ/g, "u")
    .replace(/litre|liter/g, "l");
}

/**
 * Per-biomarker conversion factors expressed as `mmol/L → mg/dL` (i.e. multiply
 * a mmol/L value by this to obtain mg/dL). The inverse is applied automatically.
 */
const MMOL_TO_MGDL: Record<string, number> = {
  GLUCOSE: 18.0182,
  TOTAL_CHOLESTEROL: 38.67,
  LDL: 38.67,
  HDL: 38.67,
  VLDL: 38.67,
  TRIGLYCERIDES: 88.57,
  CREATININE: 0.0113, // creatinine is reported in umol/L → mg/dL uses 0.0113
  BUN: 2.801, // urea mmol/L → BUN mg/dL
};

/**
 * Converts a value from its extracted unit to the target (reference) unit.
 *
 * Handles identity conversions, common metric prefix pairs (g↔mg↔ug↔ng↔pg per
 * the same denominator), and biomarker-specific molar conversions (mmol/L ↔
 * mg/dL). Returns `null` when no safe conversion is known, so the caller can
 * keep the raw value and mark the range comparison as UNKNOWN rather than
 * produce a misleading status.
 *
 * @param biomarkerCode - Canonical biomarker code (drives molar conversions).
 * @param value - Numeric value in the source unit.
 * @param fromUnit - Source unit as printed on the report.
 * @param toUnit - Target (reference range) unit.
 * @returns The conversion result, or `null` if not convertible.
 */
export function convertUnit(
  biomarkerCode: string,
  value: number,
  fromUnit: string | null,
  toUnit: string,
): UnitConversion | null {
  const to = canon(toUnit);

  // No source unit → assume it is already in the target unit.
  if (!fromUnit) return { value, factor: 1 };

  const from = canon(fromUnit);
  if (from === to) return { value, factor: 1 };

  // Molar ↔ conventional conversions.
  const molar = MMOL_TO_MGDL[biomarkerCode];
  if (molar) {
    if ((from === "mmol/l" || from === "umol/l") && to === "mg/dl") {
      return { value: value * molar, factor: molar };
    }
    if (from === "mg/dl" && (to === "mmol/l" || to === "umol/l")) {
      return { value: value / molar, factor: 1 / molar };
    }
  }

  // Mass-concentration metric-prefix conversions sharing the same denominator.
  const prefix: Record<string, number> = { g: 1, mg: 1e-3, ug: 1e-6, ng: 1e-9, pg: 1e-12 };
  const massMatch = /^([a-z]+)\/([a-z0-9.]+)$/;
  const fromParts = from.match(massMatch);
  const toParts = to.match(massMatch);
  if (fromParts && toParts && fromParts[2] === toParts[2]) {
    const fromP = prefix[fromParts[1]];
    const toP = prefix[toParts[1]];
    if (fromP && toP) {
      const factor = fromP / toP;
      return { value: value * factor, factor };
    }
  }

  return null;
}
