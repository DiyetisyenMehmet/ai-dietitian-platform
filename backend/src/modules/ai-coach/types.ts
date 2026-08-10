import type { AiMemoryType } from "@prisma/client";

/**
 * Shared types for the AI Health Coach intelligence layer (Sprint 19). These
 * describe the structured payloads persisted in `AiMemory.content` and the
 * DTOs returned by the coach services/endpoints. All user-facing strings are
 * Turkish; nothing here is medical diagnosis — coaching guidance only.
 */

/** Severity of a detected risk. */
export type RiskSeverity = "low" | "medium" | "high";

/** A single risk-detection finding (coaching recommendation, never diagnosis). */
export interface RiskAlert {
  type: string;
  severity: RiskSeverity;
  message: string;
  recommendation: string;
}

/** Result of the smart-question progress-decline detector. */
export interface ProgressDeclineResult {
  declined: boolean;
  reason: string;
  suggestedQuestions: string[];
}

/** Result of a dynamic nutrition-adaptation run. */
export interface NutritionAdaptationResult {
  adapted: boolean;
  reason: string;
  changes: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null;
}

/** A single upserted memory entry (thin view over the AiMemory row). */
export interface MemoryEntry {
  memoryType: AiMemoryType;
  content: Record<string, unknown>;
  updatedAt: Date;
}

/** Structured question block appended to an AI reply when progress declines. */
export interface SmartQuestionBlock {
  intro: string;
  categories: { key: string; question: string }[];
}
