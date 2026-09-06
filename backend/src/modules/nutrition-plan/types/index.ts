/**
 * Shared TypeScript types for Diewish's Personalized Nutrition Plan Engine.
 * Safety: all guidance is nutritional; never diagnosis, treatment or prescription.
 */

/** User-selectable plan horizons. SIXTY_DAY remains persistence-only for history. */
export type PlanDuration = "SEVEN_DAY" | "FOURTEEN_DAY" | "THIRTY_DAY";
export type WeightGoal = "LOSE_WEIGHT" | "MAINTAIN_WEIGHT" | "GAIN_WEIGHT";
export type CalculationGender = "MALE" | "FEMALE" | "NEUTRAL";
export type ActivityLevel = "SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE";

export interface NutritionProfile {
  ageYears: number;
  gender: CalculationGender;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
  dietaryPreference: string;
  healthConditions: string[];
  allergies: string[];
  dailyWaterGoalMl: number;
}

export interface CalorieCalculation {
  bmr: number;
  tdee: number;
  dailyCalories: number;
  activityMultiplier: number;
  goal: WeightGoal;
  goalAdjustmentPct: number;
}

export interface MacroBreakdown {
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  proteinCalories: number;
  carbsCalories: number;
  fatCalories: number;
  proteinRatio: number;
  carbsRatio: number;
  fatRatio: number;
  carbModerated: boolean;
}

export interface WaterRecommendation {
  waterMl: number;
  baseMl: number;
  activityBonusMl: number;
}

export interface MealSlot {
  name: string;
  time: string;
  calorieShare: number;
}

export interface MealTimingRecommendation {
  mealsPerDay: number;
  slots: MealSlot[];
}

export interface PlannedFood {
  name: string;
  portion: string;
  calories: number;
}

export interface PlannedMeal {
  name: string;
  time: string;
  foods: PlannedFood[];
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  explanation: string;
}

export interface DailyPlan {
  dayLabel: string;
  meals: PlannedMeal[];
  totalCalories: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
  notes?: string;
}

export interface CalendarDay {
  dayNumber: number;
  cycleIndex: number;
}

/**
 * Historical field names are retained for backwards compatibility. For every
 * newly generated 7/14/30-day plan, `cycle.length === durationDays` and every
 * calendar entry points to a unique day rather than repeating a weekly cycle.
 */
export interface NutritionPlanContent {
  durationDays: number;
  cycleLengthDays: number;
  cycle: DailyPlan[];
  calendar: CalendarDay[];
}

export interface PlanExplanations {
  calories: string;
  macros: string;
  water: string;
  mealTiming: string;
  overall: string;
}

export interface BloodTestImplicationInput {
  biomarkerName: string;
  implication: string;
  suggestedFoods: string[];
  foodsToLimit: string[];
}

/** Common deterministic context used to generate the complete selected horizon. */
export interface NutritionPlanGenerationInput {
  goal: WeightGoal;
  dailyCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  waterMl: number;
  mealTiming: MealTimingRecommendation;
  dietaryPreference: string;
  allergies: string[];
  healthConditions: string[];
  bloodTestImplications: BloodTestImplicationInput[];
  durationDays: number;
}

/**
 * Input for one bounded provider batch. `cycleLengthDays` intentionally remains
 * the provider-facing field so every adapter keeps the established contract.
 */
export interface NutritionPlanAIInput extends Omit<NutritionPlanGenerationInput, "durationDays"> {
  cycleLengthDays: number;
  /** Full selected horizon and batch offset are context for provider upgrades. */
  planDurationDays?: number;
  startDayNumber?: number;
  avoidMealSignatures?: string[];
}

export interface NutritionPlanAIOutput {
  cycle: DailyPlan[];
  explanations: PlanExplanations;
  recommendations: string[];
  summary: string;
}

export interface AssembledNutritionPlan {
  duration: PlanDuration;
  calories: CalorieCalculation;
  macros: MacroBreakdown;
  water: WaterRecommendation;
  mealTiming: MealTimingRecommendation;
  content: NutritionPlanContent;
  explanations: PlanExplanations;
  recommendations: string[];
  summary: string;
}
