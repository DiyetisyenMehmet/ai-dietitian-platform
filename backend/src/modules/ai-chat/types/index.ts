/**
 * Shared types for Diewish's AI Dietitian Chat (Sprint 14, C2).
 *
 * These types form the contract between the chat orchestrator, the PHI
 * minimizer, and the provider-agnostic AI adapter. The context types are
 * deliberately built from DERIVED, NON-IDENTIFYING fields only (AD-039): no
 * name, email, user id, exact date of birth, or raw document text ever leaves
 * the system boundary.
 */

/** A single turn replayed to the model as conversation history. */
export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/** Minimized profile facts safe to send to an external model. */
export interface MinimizedProfileContext {
  ageYears?: number;
  gender?: string;
  heightCm?: number;
  currentWeightKg?: number;
  targetWeightKg?: number;
  activityLevel?: string;
  dietaryPreference?: string;
  healthConditions: string[];
  allergies: string[];
}

/** Minimized snapshot of the user's active nutrition plan, if any. */
export interface MinimizedPlanContext {
  goal?: string;
  dailyCalories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
  waterMl?: number;
  mealsPerDay?: number;
}

/** A single minimized blood-test nutrition implication. */
export interface MinimizedBloodImplication {
  biomarkerName: string;
  implication: string;
  suggestedFoods: string[];
  foodsToLimit: string[];
}

/** Minimized snapshot of the user's latest blood-test analysis, if any. */
export interface MinimizedBloodContext {
  abnormalBiomarkers: string[];
  implications: MinimizedBloodImplication[];
}

/**
 * The full non-identifying context assembled for a chat turn. Everything here
 * is derived/aggregated; it carries no direct identifiers (AD-039).
 */
export interface MinimizedChatContext {
  profile?: MinimizedProfileContext;
  activePlan?: MinimizedPlanContext;
  bloodAnalysis?: MinimizedBloodContext;
}

/** Input passed to the AI adapter to produce a dietitian chat reply. */
export interface DietitianChatAIInput {
  context: MinimizedChatContext;
  /** Bounded, PHI-redacted prior turns (oldest first). */
  history: ChatHistoryTurn[];
  /** The current user message (PHI-redacted for the external call). */
  message: string;
}

/** Structured output returned by the AI adapter's chat generator. */
export interface DietitianChatAIOutput {
  /** The assistant reply (sanitized; disclaimer appended when relevant). */
  reply: string;
}
