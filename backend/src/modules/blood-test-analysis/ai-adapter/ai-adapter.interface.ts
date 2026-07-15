/**
 * Provider-agnostic AI adapter contract for Diewish's Blood Test Analysis Engine.
 *
 * The engine never talks to a specific vendor SDK directly; it depends only on
 * this interface. Concrete adapters (OpenAI-compatible today) are supplied by
 * the factory, so the AI provider can be swapped purely through configuration.
 */

import type {
  AnalysisContext,
  BloodTestAnalysisResult,
  ExtractedBloodTestValues,
  NormalizedBloodTestValue,
} from "../types";

// Re-export the shared types so consumers of the adapter get everything from
// a single import site.
export type {
  AnalysisContext,
  BiomarkerExplanation,
  BloodTestAnalysisResult,
  BloodTestValueStatus,
  ExtractedBloodTestValue,
  ExtractedBloodTestValues,
  NormalizedBloodTestValue,
  NutritionImplication,
  ReferenceRangeSnapshot,
} from "../types";

/** Identifying metadata for the active AI provider/model. */
export interface AIAdapterInfo {
  /** Human-readable provider identifier (e.g. "openai-compatible"). */
  provider: string;
  /** Concrete model name in use (e.g. "gpt-4o"). */
  model: string;
}

/**
 * The provider-agnostic AI adapter. Implementations MUST enforce Diewish's
 * safety constraints (no diagnosis/treatment/prescription; nutrition-only) and
 * return structured, schema-valid data.
 */
export interface IAIAdapter {
  /** Static provider/model info for logging and persistence. */
  readonly info: AIAdapterInfo;

  /**
   * Extracts raw laboratory values from document content.
   *
   * @param content - UTF-8 text (for the text path) or a raw file Buffer (for
   *                  the vision path).
   * @param mimeType - MIME type of the content, used to choose text vs. image.
   * @returns The structured values plus any recovered raw text.
   */
  extractBloodTestValues(
    content: string | Buffer,
    mimeType: string,
  ): Promise<ExtractedBloodTestValues>;

  /**
   * Produces plain-language explanations and nutrition-focused implications for
   * a set of normalized values.
   *
   * @param normalizedValues - The normalized, reference-compared values.
   * @param context - Non-sensitive user context to tailor the guidance.
   * @returns The structured analysis result (explanations, implications, etc.).
   */
  analyzeBloodTestValues(
    normalizedValues: NormalizedBloodTestValue[],
    context: AnalysisContext,
  ): Promise<BloodTestAnalysisResult>;
}
