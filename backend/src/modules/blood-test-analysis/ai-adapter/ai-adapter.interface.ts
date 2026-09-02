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
import type { NutritionPlanAIInput, NutritionPlanAIOutput } from "../../nutrition-plan/types";
import type { DietitianChatAIInput, DietitianChatAIOutput } from "../../ai-chat/types";
import type { DocumentValidationResult } from "../validation/document-validation.types";
import type { FoodScanResult } from "../../food-scan/types";

export type { DocumentValidationResult } from "../validation/document-validation.types";
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
   * Validates whether a document is a genuine, readable laboratory blood-test
   * report BEFORE any extraction or medical analysis is attempted.
   */
  validateBloodTestDocument(
    content: string | Buffer,
    mimeType: string,
  ): Promise<DocumentValidationResult>;

  /** Extracts raw laboratory values from document content. */
  extractBloodTestValues(
    content: string | Buffer,
    mimeType: string,
  ): Promise<ExtractedBloodTestValues>;

  /** Produces nutrition-focused explanations for normalized blood-test values. */
  analyzeBloodTestValues(
    normalizedValues: NormalizedBloodTestValue[],
    context: AnalysisContext,
  ): Promise<BloodTestAnalysisResult>;

  /** Generates a personalized nutrition plan from deterministic targets/context. */
  generateNutritionPlan(input: NutritionPlanAIInput): Promise<NutritionPlanAIOutput>;

  /** Produces one bounded, PHI-minimized AI Dietitian chat reply. */
  chatWithDietitian(input: DietitianChatAIInput): Promise<DietitianChatAIOutput>;

  /**
   * Classifies a meal photo and, only when actual food/beverage is confidently
   * present, returns conservative visual portion/calorie/macro estimates.
   * Blank, unrelated or non-food images MUST return isFood=false.
   */
  analyzeFoodImage(content: Buffer, mimeType: string): Promise<FoodScanResult>;
}
