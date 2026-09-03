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
 * Deterministic, non-identifying recent behavior summary. Raw log rows and
 * timestamps are never sent to the provider; only aggregates needed for useful
 * coaching are exposed.
 */
export interface MinimizedRecentTrackingContext {
  windowHours: number;
  mealCount: number;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  waterMl: number;
  /** Latest recorded weight from the recent trend window, when available. */
  latestWeightKg?: number;
  /** Difference latest - oldest over the recent trend window. */
  weightChangeKg?: number;
}

/** Full non-identifying context assembled for a chat turn. */
export interface MinimizedChatContext {
  profile?: MinimizedProfileContext;
  activePlan?: MinimizedPlanContext;
  bloodAnalysis?: MinimizedBloodContext;
  recentTracking?: MinimizedRecentTrackingContext;
  /** Pre-rendered, bounded, non-identifying long-term coaching memory. */
  memory?: string;
}

/** Input passed to the AI adapter to produce a dietitian chat reply. */
export interface DietitianChatAIInput {
  context: MinimizedChatContext;
  history: ChatHistoryTurn[];
  message: string;
  premium?: boolean;
}

/** Structured output returned by the AI adapter's chat generator. */
export interface DietitianChatAIOutput {
  reply: string;
}
