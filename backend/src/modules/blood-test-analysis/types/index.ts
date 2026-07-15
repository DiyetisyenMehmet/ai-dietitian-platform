/**
 * Shared TypeScript types for Diewish's AI Blood Test Analysis Engine (Sprint 12).
 *
 * These types form the contract between the extraction pipeline, the value
 * normalizer, the reference-range comparison, and the provider-agnostic AI
 * adapter. They are also the shape persisted on `BloodTestAnalysis` JSON columns
 * so downstream features (nutrition plan generator, dietitian chat, progress
 * tracking, future health reports) can consume them without re-deriving.
 */

/** How the laboratory values were recovered from the uploaded document. */
export type ExtractionMethod = "TEXT" | "OCR" | "VISION";

/** Where a value sits relative to its reference range. */
export type BloodTestValueStatus =
  | "NORMAL"
  | "LOW"
  | "HIGH"
  | "CRITICALLY_LOW"
  | "CRITICALLY_HIGH"
  | "UNKNOWN";

/** A single laboratory value as first read from the document (pre-normalization). */
export interface ExtractedBloodTestValue {
  /** Raw biomarker label exactly as printed on the report. */
  name: string;
  /** Raw value string as printed (may include symbols, e.g. "<0.5"). */
  rawValue: string;
  /** Unit string as printed on the report, if any. */
  unit?: string;
}

/** The full output of an extraction pass. */
export interface ExtractedBloodTestValues {
  /** Structured values recovered from the document. */
  values: ExtractedBloodTestValue[];
  /** Raw text recovered (empty for pure-vision extraction). */
  rawText: string;
}

/** Result of the hybrid extraction pipeline, including which path was used. */
export interface ExtractionResult extends ExtractedBloodTestValues {
  method: ExtractionMethod;
}

/** A compact snapshot of the reference range applied to a value. */
export interface ReferenceRangeSnapshot {
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  optimalMin: number | null;
  optimalMax: number | null;
  source: string;
}

/** A normalized, reference-compared laboratory value. */
export interface NormalizedBloodTestValue {
  /** Canonical biomarker code (e.g. "GLUCOSE", "HDL"). */
  biomarkerCode: string;
  /** Canonical display name. */
  biomarkerName: string;
  /** Original raw value string. */
  rawValue: string;
  /** Parsed numeric value in the reference-range unit (post-conversion). */
  numericValue: number | null;
  /** Canonical unit the numericValue is expressed in. */
  unit: string;
  /** Unit as printed on the source document. */
  extractedUnit: string | null;
  /** Multiplicative factor applied to convert extractedUnit → unit (1 if none). */
  conversionFactor: number;
  /** The reference range applied, or null when no match was found. */
  referenceRange: ReferenceRangeSnapshot | null;
  /** Computed status relative to the reference range. */
  status: BloodTestValueStatus;
}

/** Non-sensitive context passed to the AI adapter to tailor explanations. */
export interface AnalysisContext {
  /** Derived age in years, if known. */
  age?: number | null;
  /** Biological sex/gender used for reference selection. */
  gender?: "MALE" | "FEMALE" | "ALL";
  /** ISO 3166-1 alpha-2 country code, if known. */
  country?: string | null;
  /** High-level dietary pattern, if known. */
  dietaryPreference?: string | null;
  /** Free-form declared health conditions (non-diagnostic context only). */
  healthConditions?: string[];
  /** Free-form declared allergies. */
  allergies?: string[];
}

/** Plain-language explanation of one biomarker value. */
export interface BiomarkerExplanation {
  biomarkerCode: string;
  biomarkerName: string;
  status: BloodTestValueStatus;
  /** What the value means, in plain language. Never a diagnosis. */
  explanation: string;
}

/** Nutrition-focused implication of one (typically abnormal) value. */
export interface NutritionImplication {
  biomarkerCode: string;
  biomarkerName: string;
  /** Nutritional relevance of the value. Never medical treatment. */
  implication: string;
  /** Foods/nutrients that may support healthier values. */
  suggestedFoods: string[];
  /** Foods/nutrients worth moderating. */
  foodsToLimit: string[];
}

/** The structured analysis returned by the AI adapter. */
export interface BloodTestAnalysisResult {
  explanations: BiomarkerExplanation[];
  nutritionImplications: NutritionImplication[];
  /** Ordered, prioritized list of nutrition recommendations. */
  overallRecommendations: string[];
  /** 2–3 sentence plain-language summary. */
  summary: string;
}
