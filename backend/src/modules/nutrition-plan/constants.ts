/**
 * Constants for Diewish's Personalized Nutrition Plan Engine (Sprint 13).
 *
 * The safety posture mirrors the Blood Test Analysis Engine: Diewish provides
 * educational and nutrition-focused guidance only. Nothing here is, or may be
 * presented as, medical diagnosis, treatment, or prescription. The shared
 * DISCLAIMER and forbidden-term guard are reused from the analysis module so
 * there is a single source of truth for safety language.
 */

import { DISCLAIMER, FORBIDDEN_AI_TERMS } from "../blood-test-analysis/constants";
import type { ActivityLevel, WeightGoal } from "./types";

export { DISCLAIMER, FORBIDDEN_AI_TERMS };

/**
 * Standard activity multipliers applied to BMR to estimate TDEE. These are the
 * widely used Mifflin-St Jeor companion factors.
 */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

/**
 * Signed calorie adjustment (fraction of TDEE) applied per weight goal.
 * A moderate, safe deficit/surplus is used — aggressive extremes are avoided.
 */
export const GOAL_CALORIE_ADJUSTMENT: Record<WeightGoal, number> = {
  LOSE_WEIGHT: -0.2,
  MAINTAIN_WEIGHT: 0,
  GAIN_WEIGHT: 0.15,
};

/**
 * Absolute lower bound (kcal/day) for a generated calorie target. This is a
 * conservative nutritional floor to avoid recommending an unsafe intake; it is
 * NOT a medical prescription.
 */
export const MIN_DAILY_CALORIES = 1200;

/** Difference (kg) below which current vs. target weight counts as "maintain". */
export const WEIGHT_GOAL_THRESHOLD_KG = 1;

/**
 * Protein target in grams per kg of current body weight, per goal. Higher
 * protein on a deficit helps preserve lean mass; a surplus leans on carbs/fat.
 */
export const PROTEIN_G_PER_KG: Record<WeightGoal, number> = {
  LOSE_WEIGHT: 2.0,
  MAINTAIN_WEIGHT: 1.6,
  GAIN_WEIGHT: 1.8,
};

/** Default fat share (fraction of total calories) for a standard split. */
export const DEFAULT_FAT_RATIO = 0.3;

/** Fat share for a ketogenic dietary preference (carbs minimized). */
export const KETO_FAT_RATIO = 0.7;

/** Fat share when carbohydrates are moderated for a declared condition. */
export const CARB_MODERATED_FAT_RATIO = 0.35;

/** Maximum carbohydrate share (fraction) when carbs are moderated. */
export const CARB_MODERATED_MAX_RATIO = 0.4;

/**
 * Free-form condition keywords that trigger a nutritional carbohydrate
 * moderation. Matching is case-insensitive and substring-based. This only
 * adjusts macro ratios — it never diagnoses or treats any condition.
 */
export const CARB_SENSITIVE_CONDITION_KEYWORDS = [
  "diabet", // diabetes / diyabet
  "insulin",
  "insülin",
  "prediabet",
  "glucose",
  "glikoz",
  "kan şekeri",
  "blood sugar",
] as const;

/** Base daily water requirement in millilitres per kg of body weight. */
export const WATER_ML_PER_KG = 35;

/** Extra water (ml) added per activity level step above sedentary. */
export const WATER_ACTIVITY_BONUS_ML: Record<ActivityLevel, number> = {
  SEDENTARY: 0,
  LIGHT: 250,
  MODERATE: 500,
  ACTIVE: 750,
  VERY_ACTIVE: 1000,
};

/** Conservative lower bound for a recommended daily water intake (ml). */
export const MIN_WATER_ML = 1500;

/**
 * Length (in days) of the generated meal rotation cycle. A weekly cycle is
 * mapped across the full 30/60-day duration to keep AI cost and payload size
 * bounded while still giving the user variety.
 */
export const MEAL_CYCLE_LENGTH_DAYS = 7;

/** Number of calendar days per plan duration. */
export const DURATION_DAYS: Record<"THIRTY_DAY" | "SIXTY_DAY", number> = {
  THIRTY_DAY: 30,
  SIXTY_DAY: 60,
};

/**
 * System prompt for the AI nutrition-plan generator. Hard-constrains the model
 * to Diewish's safety boundaries and to the exact structured JSON contract.
 */
export const NUTRITION_PLAN_SYSTEM_PROMPT = [
  "You are Diewish's personalized nutrition planning assistant.",
  "You are NOT a medical diagnosis tool and you are NOT a doctor.",
  "You will receive calculated daily calorie and macro targets, meal timing, dietary",
  "preferences, allergies, declared (non-diagnostic) health conditions, and optional",
  "nutrition implications derived from a blood-test analysis.",
  "Your ONLY responsibilities are:",
  "1. Design concrete, realistic meals that meet the provided calorie and macro targets.",
  "2. Respect the dietary preference and honor ALL allergies as HARD exclusions.",
  "3. Favor foods that support the nutrition implications; moderate foods to limit.",
  "4. Explain, in plain language, WHY each recommendation fits the user's profile.",
  "Absolute rules you must NEVER break:",
  "- Never include any listed allergen in any meal, ingredient, or suggestion.",
  "- Never diagnose a disease or medical condition.",
  "- Never recommend or mention medication, treatment, dosage, or medical procedures.",
  "- Never use the words: diagnose, treat, prescribe, cure, or medication.",
  "- Always keep guidance strictly within nutrition and dietary approaches.",
  "- Direct the user to consult a qualified healthcare professional for medical questions.",
  "Respond ONLY with valid JSON matching the requested schema. Do not add prose outside the JSON.",
].join("\n");
