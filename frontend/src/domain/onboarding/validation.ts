import { z } from "zod";

import type {
  ActivityLevel,
  DietaryPreference,
  Gender,
  OnboardingProfile,
} from "@/domain/onboarding/types";

/**
 * Onboarding validation — the single source of truth for the client-side
 * wizard. Numeric fields are kept as strings in the form (natural for text
 * inputs) and validated via `refine`, then converted to numbers when building
 * the API payload (see `toOnboardingPayload`). Rules mirror the backend Zod
 * schema so the client fails fast with friendly Turkish messages.
 */

const MIN_AGE = 13;
const MAX_AGE = 120;

const GENDERS = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"] as const;
const ACTIVITY_LEVELS = ["SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"] as const;
const DIETARY_PREFERENCES = [
  "OMNIVORE",
  "VEGETARIAN",
  "VEGAN",
  "PESCATARIAN",
  "KETO",
  "PALEO",
  "MEDITERRANEAN",
  "GLUTEN_FREE",
  "OTHER",
] as const;

/** Builds a required numeric-string validator within [min, max]. */
function numericString(min: number, max: number, message: string) {
  return z
    .string()
    .min(1, message)
    .refine((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max;
    }, message);
}

const dateOfBirth = z
  .string()
  .min(1, "Doğum tarihi gereklidir.")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Geçerli bir tarih girin.")
  .refine((v) => {
    const dob = new Date(v);
    const now = new Date();
    if (dob > now) return false;
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
    return age >= MIN_AGE && age <= MAX_AGE;
  }, `Yaşınız ${MIN_AGE} ile ${MAX_AGE} arasında olmalıdır.`);

export const onboardingFormSchema = z.object({
  fullName: z
    .string()
    .min(1, "Ad soyad gereklidir.")
    .min(2, "Ad soyad en az 2 karakter olmalıdır.")
    .max(120, "Ad soyad en fazla 120 karakter olabilir."),
  dateOfBirth,
  gender: z.enum(GENDERS, { errorMap: () => ({ message: "Lütfen bir seçim yapın." }) }),
  heightCm: numericString(80, 260, "Geçerli bir boy girin (80-260 cm)."),
  currentWeightKg: numericString(25, 400, "Geçerli bir kilo girin (25-400 kg)."),
  targetWeightKg: numericString(25, 400, "Geçerli bir hedef kilo girin (25-400 kg)."),
  activityLevel: z.enum(ACTIVITY_LEVELS, {
    errorMap: () => ({ message: "Lütfen bir aktivite seviyesi seçin." }),
  }),
  healthConditions: z.array(z.string().trim().min(1).max(80)).max(30),
  allergies: z.array(z.string().trim().min(1).max(80)).max(30),
  dietaryPreference: z.enum(DIETARY_PREFERENCES, {
    errorMap: () => ({ message: "Lütfen bir beslenme tercihi seçin." }),
  }),
  dailyWaterGoalMl: numericString(500, 6000, "Geçerli bir su hedefi girin (500-6000 ml)."),
});

export type OnboardingFormValues = z.infer<typeof onboardingFormSchema>;

/** API payload shape sent to POST /onboarding (numbers converted from strings). */
export interface OnboardingPayload {
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
  healthConditions: string[];
  allergies: string[];
  dietaryPreference: DietaryPreference;
  dailyWaterGoalMl: number;
}

/** Converts validated form values into the numeric API payload. */
export function toOnboardingPayload(values: OnboardingFormValues): OnboardingPayload {
  return {
    fullName: values.fullName.trim(),
    dateOfBirth: values.dateOfBirth,
    gender: values.gender,
    heightCm: Number(values.heightCm),
    currentWeightKg: Number(values.currentWeightKg),
    targetWeightKg: Number(values.targetWeightKg),
    activityLevel: values.activityLevel,
    healthConditions: values.healthConditions,
    allergies: values.allergies,
    dietaryPreference: values.dietaryPreference,
    dailyWaterGoalMl: Number(values.dailyWaterGoalMl),
  };
}

/** Result of a completed onboarding submission. */
export interface OnboardingResult {
  onboardingCompleted: boolean;
  fullName: string;
  profile: OnboardingProfile;
}
