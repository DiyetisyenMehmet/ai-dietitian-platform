/**
 * Clinical Correlation Engine (Sprint 21.1).
 *
 * Improves ONLY the Medical AI interpretation quality. Instead of letting the
 * model reason about every biomarker in isolation, this engine detects
 * clinically related parameter groups that are fully present in a report and
 * asks the model to interpret each complete group TOGETHER as a single,
 * de-duplicated, non-contradictory interpretation.
 *
 * It is completely independent and side-effect free: it neither changes
 * extraction, OCR, validation nor the medical safety wording. It only inspects
 * which biomarker codes are present and produces an additional instruction
 * block that is appended to the blood-test interpretation prompt. The clinical
 * safety constraints (no invented diagnoses, conservative language, existing
 * disclaimers) are restated so correlated analysis never loosens them.
 */

/** A clinically related group of biomarkers that should be read together. */
interface CorrelationGroup {
  /** Stable identifier for logging. */
  readonly id: string;
  /** Human-readable label used in the AI instruction. */
  readonly label: string;
  /** Canonical biomarker codes that make up the group. */
  readonly codes: readonly string[];
  /**
   * How many of the group's codes must be present for the group to be treated
   * as "complete". Defaults to ALL codes; a few panels stay clinically
   * meaningful with a documented minimum subset.
   */
  readonly minPresent?: number;
}

/**
 * The clinically related groups. Codes match the canonical biomarker codes in
 * `biomarker-aliases.map.ts`. (CRP is not yet in the biomarker set, so the
 * inflammation group simply never completes today — it is listed for forward
 * compatibility and has no runtime effect until CRP is added.)
 */
const CORRELATION_GROUPS: readonly CorrelationGroup[] = [
  {
    id: "iron-anemia",
    label: "Iron status & anemia panel (Ferritin, Hemoglobin, Hematocrit, RBC, MCV, MCH)",
    codes: ["FERRITIN", "HGB", "HCT", "RBC", "MCV", "MCH"],
    // Anemia interpretation is meaningful once the core indices are present.
    minPresent: 4,
  },
  {
    id: "liver-enzymes",
    label: "Liver enzymes (ALT, AST)",
    codes: ["ALT", "AST"],
  },
  {
    id: "lipid-panel",
    label: "Lipid panel (HDL, LDL, Triglycerides)",
    codes: ["HDL", "LDL", "TRIGLYCERIDES"],
  },
  {
    id: "renal-function",
    label: "Renal function (Creatinine, Urea/BUN, eGFR)",
    codes: ["CREATININE", "BUN", "EGFR"],
    minPresent: 2,
  },
  {
    id: "thyroid",
    label: "Thyroid function (TSH, Free T4)",
    codes: ["TSH", "FT4"],
  },
  {
    id: "inflammation",
    label: "Inflammation (CRP, WBC)",
    codes: ["CRP", "WBC"],
  },
  {
    id: "glycemic",
    label: "Glycemic control (HbA1c, Glucose)",
    codes: ["HBA1C", "GLUCOSE"],
  },
];

/** The minimal shape the engine needs from a normalized value. */
export interface CorrelationInput {
  readonly biomarkerCode: string;
}

/**
 * Detects which correlation groups are complete in the supplied values.
 *
 * @param values - Normalized values (only `biomarkerCode` is read).
 * @returns The complete groups, in the fixed clinical order above.
 */
export function detectCompleteGroups(values: readonly CorrelationInput[]): CorrelationGroup[] {
  const present = new Set(values.map((v) => v.biomarkerCode));
  return CORRELATION_GROUPS.filter((group) => {
    const found = group.codes.filter((code) => present.has(code)).length;
    const required = group.minPresent ?? group.codes.length;
    return found >= required;
  });
}

/**
 * Builds the correlation instruction block to append to the interpretation
 * prompt, or `null` when no related group is complete (so single-parameter
 * behaviour is unchanged).
 *
 * The instruction preserves all existing safety constraints and only asks for
 * combined, de-duplicated, non-contradictory interpretations of the detected
 * groups.
 *
 * @param values - Normalized values (only `biomarkerCode` is read).
 * @returns The instruction text, or `null` when there is nothing to correlate.
 */
export function buildClinicalCorrelationDirective(
  values: readonly CorrelationInput[],
): string | null {
  const groups = detectCompleteGroups(values);
  if (groups.length === 0) return null;

  const lines = [
    "CLINICAL CORRELATION INSTRUCTIONS (apply to the interpretation only):",
    "The following clinically related parameter groups are fully present in this report.",
    "Interpret the members of each group TOGETHER as one combined clinical picture rather than independently:",
    ...groups.map((g) => `  - ${g.label}`),
    "",
    "When correlating:",
    "  - Produce ONE combined interpretation per group and reflect it in the explanations and overallRecommendations.",
    "  - Do NOT repeat identical or near-identical recommendations across correlated parameters; consolidate them.",
    "  - Do NOT issue contradictory recommendations for parameters in the same group.",
    "  - Do NOT invent diagnoses or name specific diseases; describe patterns cautiously.",
    "  - Keep conservative, non-alarming clinical language and preserve all existing safety wording and disclaimers.",
  ];

  return lines.join("\n");
}
