import { z } from "zod";

/**
 * Zod schemas and derived DTO types for the onboarding module. Single source of
 * truth for the mandatory profile payload; the `validate` middleware parses
 * requests against `onboardingSchema` and the service consumes the inferred type.
 *
 * Enum members mirror the Prisma enums (Gender / ActivityLevel /
 * DietaryPreference) so the persistence layer receives values it can store
 * without translation.
 */

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

/** Reasonable human bounds — guards against typos and abuse, not medical limits. */
const MIN_AGE_YEARS = 13; // App Store / KVKK minimum age posture for V1.
const MAX_AGE_YEARS = 120;

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** A YYYY-MM-DD calendar date, validated for realistic age bounds. */
const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfBirth must be in YYYY-MM-DD format")
  .refine((value) => !Number.isNaN(Date.parse(value)), "dateOfBirth is not a valid date")
  .superRefine((value, ctx) => {
    const dob = new Date(`${value}T00:00:00.000Z`);
    const now = today();
    const min = new Date(now);
    min.setFullYear(min.getFullYear() - MAX_AGE_YEARS);
    const max = new Date(now);
    max.setFullYear(max.getFullYear() - MIN_AGE_YEARS);

    if (dob > now) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "dateOfBirth cannot be in the future" });
      return;
    }
    if (dob > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `You must be at least ${MIN_AGE_YEARS} years old`,
      });
    }
    if (dob < min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "dateOfBirth is out of range" });
    }
  });

/** Free-form list entries (health conditions / allergies): trimmed, deduped, bounded. */
const stringList = z
  .array(z.string().trim().min(1).max(80))
  .max(30, "Too many entries")
  .default([])
  .transform((items) => Array.from(new Set(items)));

export const onboardingSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(120),
  dateOfBirth: dateOfBirthSchema,
  gender: z.enum(GENDERS),
  heightCm: z.number().positive().min(80, "Height seems too low").max(260, "Height seems too high"),
  currentWeightKg: z
    .number()
    .positive()
    .min(25, "Weight seems too low")
    .max(400, "Weight seems too high"),
  targetWeightKg: z
    .number()
    .positive()
    .min(25, "Target weight seems too low")
    .max(400, "Target weight seems too high"),
  activityLevel: z.enum(ACTIVITY_LEVELS),
  healthConditions: stringList,
  allergies: stringList,
  dietaryPreference: z.enum(DIETARY_PREFERENCES),
  dailyWaterGoalMl: z
    .number()
    .int("Water goal must be a whole number")
    .min(500, "Water goal seems too low")
    .max(6000, "Water goal seems too high"),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
