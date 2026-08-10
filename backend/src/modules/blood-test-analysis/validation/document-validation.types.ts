/**
 * Types for the Blood Test Validation Pipeline (Sprint 25 — critical release
 * blocker).
 *
 * The pipeline runs BEFORE any OCR extraction or AI medical analysis. Its sole
 * job is to decide whether an uploaded document is a genuine, readable Turkish
 * laboratory blood-test report. Documents that are selfies, food photos, ID
 * cards, chat screenshots, or unrelated PDFs MUST be rejected here so they can
 * never reach the extraction pipeline or the medical analysis engine.
 */

/** Patient identity fields recovered from the report header (all optional). */
export interface DocumentValidationPatient {
  /** Patient full name, if printed. */
  name?: string | null;
  /** Patient gender/sex, if printed. */
  gender?: string | null;
  /** Date of birth or age, if printed. */
  birthDateOrAge?: string | null;
}

/**
 * Structured outcome of the 7-step validation pipeline for a single document.
 *
 * `classification` + `confidence` + `hasLabTable` + `parameterCount` are the
 * hard-gate inputs. The remaining fields are diagnostic metadata surfaced for
 * logging and (potentially) the client.
 */
export interface DocumentValidationResult {
  /** STEP 1 — VALID means "looks like a real lab blood-test report". */
  classification: "VALID" | "INVALID";
  /** STEP 7 — Overall confidence, 0–100. The gate requires >= threshold. */
  confidence: number;
  /** STEP 2 — Detected hospital / laboratory name, or null. */
  hospital: string | null;
  /** STEP 2/3 — Detected report date, or null. */
  reportDate: string | null;
  /** STEP 3 — Detected patient identity (missing fields do NOT auto-reject). */
  patient: DocumentValidationPatient | null;
  /** STEP 2 — Detected barcode / protocol / sample number, or null. */
  barcode: string | null;
  /** STEP 4 — Whether a laboratory result table structure was detected. */
  hasLabTable: boolean;
  /** STEP 5 — Number of recognized laboratory parameters. */
  parameterCount: number;
  /** STEP 5 — Canonical names of the recognized laboratory parameters. */
  detectedParameters: string[];
  /** STEP 6/7 — Human-readable reason for the decision (English, for logs). */
  reason: string;
}
