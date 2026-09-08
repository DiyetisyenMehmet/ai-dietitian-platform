/** A single turn replayed to the model as conversation history. */
export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

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

export interface MinimizedPlanContext {
  goal?: string;
  dailyCalories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
  waterMl?: number;
  mealsPerDay?: number;
}

export interface MinimizedBloodImplication {
  biomarkerName: string;
  implication: string;
  suggestedFoods: string[];
  foodsToLimit: string[];
}

export interface MinimizedBloodContext {
  abnormalBiomarkers: string[];
  implications: MinimizedBloodImplication[];
}

export interface MinimizedRecentTrackingContext {
  windowHours: number;
  mealCount: number;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  waterMl: number;
  latestWeightKg?: number;
  weightChangeKg?: number;
}

export interface MinimizedNutritionGrounding {
  query: string;
  servingGrams: number;
  food: { displayNameTr: string; provider: string; externalId: string };
  nutrients: {
    energyKcal: number | null;
    proteinG: number | null;
    carbohydratesG: number | null;
    fatG: number | null;
    saturatedFatG: number | null;
    sugarsG: number | null;
    fiberG: number | null;
    sodiumMg: number | null;
    saltG: number | null;
  };
  rule: "VERIFIED_NUMBERS_MUST_NOT_BE_CHANGED_OR_INVENTED";
}

export interface MinimizedChatContext {
  profile?: MinimizedProfileContext;
  activePlan?: MinimizedPlanContext;
  bloodAnalysis?: MinimizedBloodContext;
  recentTracking?: MinimizedRecentTrackingContext;
  /** Verified facts resolved server-side from Nutrition Data Layer for the current factual food question. */
  nutritionGrounding?: MinimizedNutritionGrounding;
  memory?: string;
}

export interface DietitianChatAIInput {
  context: MinimizedChatContext;
  history: ChatHistoryTurn[];
  message: string;
  premium?: boolean;
}

export interface DietitianChatAIOutput {
  reply: string;
}
