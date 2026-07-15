/**
 * PHI minimization for external AI calls (AD-039).
 *
 * Diewish must never send direct identifiers or raw sensitive documents to an
 * external AI provider. This module does two things:
 *
 *  1. `redactPii` — masks free-text identifiers (emails, phone numbers, long
 *     numeric IDs, URLs) that a user might type into a chat message before that
 *     text is forwarded to the model. The user's ORIGINAL text is still stored
 *     in Diewish's own database; redaction applies only to the outbound copy.
 *
 *  2. `buildMinimizedContext` — projects the user's rich domain records
 *     (profile, active nutrition plan, latest blood analysis) down to a small,
 *     derived, non-identifying context. Age is used (not date of birth); no
 *     name, email, user id, or raw report text is ever included.
 */

import type { BloodTestAnalysis, NutritionPlan, UserProfile } from "@prisma/client";

import type {
  MinimizedBloodContext,
  MinimizedBloodImplication,
  MinimizedChatContext,
  MinimizedPlanContext,
  MinimizedProfileContext,
} from "../types";

/** kg difference below which current vs. target weight counts as "maintain". */
const WEIGHT_GOAL_THRESHOLD_KG = 1;

/** Patterns for common direct identifiers. Order matters (emails before phones). */
const PII_PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  // Email addresses.
  { re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, replacement: "[redacted-email]" },
  // URLs (may embed identifiers/tokens).
  { re: /\bhttps?:\/\/\S+/gi, replacement: "[redacted-url]" },
  // Long digit runs (national IDs, card numbers, account numbers): 9+ digits,
  // allowing spaces/dashes as separators.
  { re: /\b(?:\d[ -]?){9,}\b/g, replacement: "[redacted-number]" },
  // Phone-like sequences with an optional leading +.
  { re: /\+?\d[\d ()-]{6,}\d/g, replacement: "[redacted-phone]" },
];

/**
 * Redacts common direct identifiers from free text before it is sent to an
 * external AI provider. Best-effort defense-in-depth on top of the system
 * prompt instruction not to solicit identifiers.
 */
export function redactPii(text: string): string {
  let out = text;
  for (const { re, replacement } of PII_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

/** Derives a non-medical nutritional goal label from profile weights. */
function deriveGoal(profile: UserProfile): string {
  const diff = profile.currentWeightKg - profile.targetWeightKg;
  if (diff > WEIGHT_GOAL_THRESHOLD_KG) return "LOSE_WEIGHT";
  if (diff < -WEIGHT_GOAL_THRESHOLD_KG) return "GAIN_WEIGHT";
  return "MAINTAIN_WEIGHT";
}

/** Age in whole years derived from a date of birth (never sends the DOB). */
function ageFromDob(dob: Date): number {
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/** Projects a profile row onto its minimized, non-identifying subset. */
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

/** Projects an active plan row onto its minimized derived numbers. */
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

/** Extracts abnormal biomarker names from the analysis `abnormalValues` JSON. */
function extractAbnormalNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => {
      const record = (v ?? {}) as Record<string, unknown>;
      return String(record.biomarkerName ?? "").trim();
    })
    .filter((name) => name.length > 0);
}

/** Extracts nutrition implications from the analysis `nutritionImplications` JSON. */
function extractImplications(raw: unknown): MinimizedBloodImplication[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => {
    const record = (v ?? {}) as Record<string, unknown>;
    return {
      biomarkerName: String(record.biomarkerName ?? ""),
      implication: String(record.implication ?? ""),
      suggestedFoods: Array.isArray(record.suggestedFoods)
        ? record.suggestedFoods.map((f) => String(f))
        : [],
      foodsToLimit: Array.isArray(record.foodsToLimit)
        ? record.foodsToLimit.map((f) => String(f))
        : [],
    };
  });
}

/** Projects a blood analysis row onto its minimized nutrition-only subset. */
function minimizeBlood(analysis: BloodTestAnalysis): MinimizedBloodContext {
  return {
    abnormalBiomarkers: extractAbnormalNames(analysis.abnormalValues as unknown),
    implications: extractImplications(analysis.nutritionImplications as unknown),
  };
}

/** Records the orchestrator loads and hands to the minimizer. */
export interface MinimizationSources {
  profile: UserProfile | null;
  activePlan: NutritionPlan | null;
  latestAnalysis: BloodTestAnalysis | null;
}

/**
 * Builds the non-identifying chat context from the caller's domain records.
 * Any absent source is simply omitted so the model receives only what exists.
 */
export function buildMinimizedContext(sources: MinimizationSources): MinimizedChatContext {
  const context: MinimizedChatContext = {};
  if (sources.profile) context.profile = minimizeProfile(sources.profile);
  if (sources.activePlan) context.activePlan = minimizePlan(sources.activePlan, sources.profile);
  if (sources.latestAnalysis) context.bloodAnalysis = minimizeBlood(sources.latestAnalysis);
  return context;
}
