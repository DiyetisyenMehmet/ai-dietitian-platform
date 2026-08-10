/**
 * Shared TypeScript types for Diewish's Personalized Nutrition Plan Engine
 * (Sprint 13).
 *
 * These types form the contract between the deterministic calculation engine
 * (calorie/macro/water/meal-timing), the AI-backed meal generator, and the
 * persistence layer. They are also the shapes persisted on the `NutritionPlan`
 * JSON columns so downstream features (dashboard, dietitian chat, progress
 * tracking, future health reports) can consume a plan without re-deriving it.
 *
 * Safety note: nothing produced by this engine is, or may be presented as,
 * medical diagnosis, treatment, or prescription. All guidance is nutritional.
 */

/** Supported plan durations (mirrors the Prisma `NutritionPlanDuration` enum). */
export type PlanDuration = "THIRTY_DAY" | "SIXTY_DAY";

/**
 * Weight goal derived from the onboarding profile (current vs. target weight).
 * This is a nutritional objective only — never a medical assessment.
 */
export type WeightGoal = "LOSE_WEIGHT" | "MAINTAIN_WEIGHT" | "GAIN_WEIGHT";

/** Biological sex used for the BMR baseline. */
export type CalculationGender = "MALE" | "FEMALE" | "NEUTRAL";

/** Activity level (mirrors the Prisma `ActivityLevel` enum). */
export type ActivityLevel = "SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE";

/**
 * The non-sensitive, normalized profile snapshot the engine operates on. Built
 * from the Sprint 9 `UserProfile` plus the optional latest blood-test analysis
 * (Sprint 12). Contains no medical diagnosis — health conditions/allergies are
 * free-form declarations used purely to constrain nutrition.
 */
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
  /** User-declared daily water goal (ml) captured at onboarding. */
  dailyWaterGoalMl: number;
}

/** Output of the calorie calculation engine. */
export interface CalorieCalculation {
  /** Basal Metabolic Rate (Mifflin-St Jeor), kcal/day. */
  bmr: number;
  /** Total Daily Energy Expenditure (BMR × activity multiplier), kcal/day. */
  tdee: number;
  /** Goal-adjusted daily calorie target (kcal/day), clamped to a safe floor. */
  dailyCalories: number;
  /** Activity multiplier applied to the BMR. */
  activityMultiplier: number;
  /** Weight goal driving the calorie adjustment. */
  goal: WeightGoal;
  /** Signed percentage applied to the TDEE for the goal (e.g. -0.2 for a cut). */
  goalAdjustmentPct: number;
}

/** Output of the macro calculation engine (grams + kcal share per macro). */
export interface MacroBreakdown {
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  proteinCalories: number;
  carbsCalories: number;
  fatCalories: number;
  /** Ratios (0-1) actually applied, useful for the dashboard/AI explanation. */
  proteinRatio: number;
  carbsRatio: number;
  fatRatio: number;
  /**
   * True when the carbohydrate share was moderated for a declared condition
   * (e.g. a blood-glucose-related condition). This is a nutritional ratio
   * adjustment only — NOT a diagnosis or treatment.
   */
  carbModerated: boolean;
}

/** Output of the water intake calculation engine. */
export interface WaterRecommendation {
  /** Recommended daily water intake in millilitres. */
  waterMl: number;
  /** Base amount from body weight (ml). */
  baseMl: number;
  /** Additional amount attributed to activity level (ml). */
  activityBonusMl: number;
}

/** A single recommended meal slot within a day. */
export interface MealSlot {
  /** Slot name, e.g. "Breakfast", "Lunch", "Snack". */
  name: string;
  /** Recommended local time in HH:mm. */
  time: string;
  /** Fraction (0-1) of daily calories this slot should target. */
  calorieShare: number;
}

/** Output of the meal-timing engine. */
export interface MealTimingRecommendation {
  mealsPerDay: number;
  slots: MealSlot[];
}

/** A concrete food item within a generated meal. */
export interface PlannedFood {
  /** Food name. */
  name: string;
  /** Human-readable portion, e.g. "1 cup", "150 g". */
  portion: string;
  /** Estimated calories for the portion. */
  calories: number;
}

/** A concrete generated meal for a single day. */
export interface PlannedMeal {
  /** Meal slot name (aligns with a {@link MealSlot}). */
  name: string;
  /** Recommended local time in HH:mm. */
  time: string;
  foods: PlannedFood[];
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  /** Plain-language reason this meal was chosen for the user. */
  explanation: string;
}

/** A single day's meal plan (one entry of the weekly rotation cycle). */
export interface DailyPlan {
  /** Cycle day label, e.g. "Day 1". */
  dayLabel: string;
  meals: PlannedMeal[];
  totalCalories: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
  /** Optional light note (e.g. hydration reminder). Never medical advice. */
  notes?: string;
}

/**
 * Mapping of a calendar day (1-based) onto an index within the weekly rotation
 * cycle. Keeping the mapping explicit lets the dashboard render any given day
 * of the 30/60-day plan without regenerating content.
 */
export interface CalendarDay {
  dayNumber: number;
  cycleIndex: number;
}

/**
 * The full structured day-by-day content persisted on `NutritionPlan.dailyPlans`.
 *
 * To control AI cost and payload size, the engine generates a short rotation
 * cycle (`cycle`, e.g. 7 days) and maps it across the whole duration via
 * `calendar` instead of asking the model for 30/60 unique days.
 */
export interface NutritionPlanContent {
  durationDays: number;
  cycleLengthDays: number;
  cycle: DailyPlan[];
  calendar: CalendarDay[];
}

/** Plain-language explanation for every recommendation surfaced to the user. */
export interface PlanExplanations {
  /** Why this calorie target was chosen. */
  calories: string;
  /** Why this macro split was chosen. */
  macros: string;
  /** Why this water target was chosen. */
  water: string;
  /** Why this meal timing/structure was chosen. */
  mealTiming: string;
  /** Overall rationale tying the plan to the user's profile + blood analysis. */
  overall: string;
}

/** A single blood-test nutrition implication fed into the meal generator. */
export interface BloodTestImplicationInput {
  biomarkerName: string;
  implication: string;
  suggestedFoods: string[];
  foodsToLimit: string[];
}

/** Input passed to the AI adapter to generate meal content + explanations. */
export interface NutritionPlanAIInput {
  goal: WeightGoal;
  dailyCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  waterMl: number;
  mealTiming: MealTimingRecommendation;
  dietaryPreference: string;
  /** Hard exclusions — no allergen may appear in any generated meal. */
  allergies: string[];
  /** Declared conditions used only to constrain nutrition (non-diagnostic). */
  healthConditions: string[];
  /** Nutrition implications carried over from the Sprint 12 blood analysis. */
  bloodTestImplications: BloodTestImplicationInput[];
  /** Number of unique days to generate for the rotation cycle. */
  cycleLengthDays: number;
}

/** Structured output returned by the AI adapter's nutrition-plan generator. */
export interface NutritionPlanAIOutput {
  /** The rotation cycle of unique daily plans (length = cycleLengthDays). */
  cycle: DailyPlan[];
  explanations: PlanExplanations;
  /** Ordered, prioritized nutrition recommendations. */
  recommendations: string[];
  /** 2-3 sentence plain-language summary (disclaimer appended by the adapter). */
  summary: string;
}

/** The fully assembled plan returned by the service (pre-persistence view). */
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
