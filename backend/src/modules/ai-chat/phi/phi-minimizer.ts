/**
 * PHI minimization for external AI calls.
 *
 * Direct identifiers and raw health documents never leave Diewish. Chat context
 * is projected into small, derived facts and recent deterministic aggregates.
 */

import type {
  BloodTestAnalysis,
  MealLog,
  NutritionPlan,
  UserProfile,
  WaterLog,
  WeightLog,
} from "@prisma/client";

import type {
  MinimizedBloodContext,
  MinimizedBloodImplication,
  MinimizedChatContext,
  MinimizedPlanContext,
  MinimizedProfileContext,
  MinimizedRecentTrackingContext,
} from "../types";

const WEIGHT_GOAL_THRESHOLD_KG = 1;
const RECENT_TRACKING_WINDOW_HOURS = 24;

const PII_PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  { re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, replacement: "[redacted-email]" },
  { re: /\bhttps?:\/\/\S+/gi, replacement: "[redacted-url]" },
  { re: /\b(?:\d[ -]?){9,}\b/g, replacement: "[redacted-number]" },
  { re: /\+?\d[\d ()-]{6,}\d/g, replacement: "[redacted-phone]" },
];

export function redactPii(text: string): string {
  let out = text;
  for (const { re, replacement } of PII_PATTERNS) out = out.replace(re, replacement);
  return out;
}

function deriveGoal(profile: UserProfile): string {
  const diff = profile.currentWeightKg - profile.targetWeightKg;
  if (diff > WEIGHT_GOAL_THRESHOLD_KG) return "LOSE_WEIGHT";
  if (diff < -WEIGHT_GOAL_THRESHOLD_KG) return "GAIN_WEIGHT";
  return "MAINTAIN_WEIGHT";
}

function ageFromDob(dob: Date): number {
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function minimizeProfile(profile: UserProfile): MinimizedProfileContext {
  return {
    ageYears: ageFromDob(profile.dateOfBirth),
    gender: profile.gender,
    heightCm: profile.heightCm,
    currentWeightKg: profile.currentWeightKg,
    targetWeightKg: profile.targetWeightKg,
    activityLevel: profile.activityLevel,
    dietaryPreference: profile.dietaryPreference,
    healthConditions: profile.healthConditions,
    allergies: profile.allergies,
  };
}

function minimizePlan(plan: NutritionPlan, profile: UserProfile | null): MinimizedPlanContext {
  return {
    ...(profile ? { goal: deriveGoal(profile) } : {}),
    dailyCalories: plan.dailyCalories,
    proteinGrams: plan.proteinGrams,
    carbsGrams: plan.carbsGrams,
    fatGrams: plan.fatGrams,
    waterMl: plan.waterMl,
    mealsPerDay: plan.mealsPerDay,
  };
}

function extractAbnormalNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(((v ?? {}) as Record<string, unknown>).biomarkerName ?? "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function extractImplications(raw: unknown): MinimizedBloodImplication[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((v) => {
    const record = (v ?? {}) as Record<string, unknown>;
    return {
      biomarkerName: String(record.biomarkerName ?? ""),
      implication: String(record.implication ?? "").slice(0, 600),
      suggestedFoods: Array.isArray(record.suggestedFoods)
        ? record.suggestedFoods.map(String).slice(0, 8)
        : [],
      foodsToLimit: Array.isArray(record.foodsToLimit)
        ? record.foodsToLimit.map(String).slice(0, 8)
        : [],
    };
  });
}

function minimizeBlood(analysis: BloodTestAnalysis): MinimizedBloodContext {
  return {
    abnormalBiomarkers: extractAbnormalNames(analysis.abnormalValues as unknown),
    implications: extractImplications(analysis.nutritionImplications as unknown),
  };
}

function sumKnown(values: Array<number | null | undefined>): number | undefined {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (known.length === 0) return undefined;
  return Math.round(known.reduce((sum, value) => sum + value, 0) * 10) / 10;
}

function minimizeRecentTracking(
  meals: MealLog[],
  water: WaterLog[],
  weights: WeightLog[],
): MinimizedRecentTrackingContext | undefined {
  if (meals.length === 0 && water.length === 0 && weights.length === 0) return undefined;

  const orderedWeights = [...weights].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const oldestWeight = orderedWeights[0]?.weightKg;
  const latestWeight = orderedWeights.at(-1)?.weightKg;
  const weightChangeKg =
    typeof oldestWeight === "number" && typeof latestWeight === "number" && orderedWeights.length >= 2
      ? Math.round((latestWeight - oldestWeight) * 10) / 10
      : undefined;

  return {
    windowHours: RECENT_TRACKING_WINDOW_HOURS,
    mealCount: meals.length,
    calories: sumKnown(meals.map((meal) => meal.calories)),
    proteinG: sumKnown(meals.map((meal) => meal.proteinG)),
    carbsG: sumKnown(meals.map((meal) => meal.carbsG)),
    fatG: sumKnown(meals.map((meal) => meal.fatG)),
    waterMl: Math.round(water.reduce((sum, entry) => sum + entry.amountMl, 0)),
    ...(typeof latestWeight === "number" ? { latestWeightKg: latestWeight } : {}),
    ...(typeof weightChangeKg === "number" ? { weightChangeKg } : {}),
  };
}

export interface MinimizationSources {
  profile: UserProfile | null;
  activePlan: NutritionPlan | null;
  latestAnalysis: BloodTestAnalysis | null;
  recentMeals?: MealLog[];
  recentWater?: WaterLog[];
  recentWeights?: WeightLog[];
}

export function buildMinimizedContext(sources: MinimizationSources): MinimizedChatContext {
  const context: MinimizedChatContext = {};
  if (sources.profile) context.profile = minimizeProfile(sources.profile);
  if (sources.activePlan) context.activePlan = minimizePlan(sources.activePlan, sources.profile);
  if (sources.latestAnalysis) context.bloodAnalysis = minimizeBlood(sources.latestAnalysis);

  const tracking = minimizeRecentTracking(
    sources.recentMeals ?? [],
    sources.recentWater ?? [],
    sources.recentWeights ?? [],
  );
  if (tracking) context.recentTracking = tracking;
  return context;
}
