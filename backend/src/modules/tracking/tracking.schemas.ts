import { z } from "zod";

/**
 * Validation schemas for the tracking domain (weight / meals / water).
 * Inputs are validated defensively so a bad client cannot poison the time-series
 * signals the AI Health Coach reasons over.
 */

/** Optional ISO timestamp; defaults to "now" when omitted. */
const optionalLoggedAt = z
  .string()
  .datetime({ message: "loggedAt must be an ISO-8601 datetime string." })
  .optional();

/**
 * Weight timestamps may be historical, but cannot be placed in the future to
 * bypass the backend-owned weekly check-in schedule. A small clock-skew window
 * keeps otherwise valid clients from failing around device/server drift.
 */
const optionalWeightLoggedAt = z
  .string()
  .datetime({ message: "loggedAt must be an ISO-8601 datetime string." })
  .refine((value) => new Date(value).getTime() <= Date.now() + 5 * 60_000, {
    message: "loggedAt cannot be in the future.",
  })
  .optional();

/** Canonical V1 weight contract shared by tracking and profile/onboarding writes. */
export const weightKgSchema = z
  .number()
  .min(25, "Weight seems too low")
  .max(400, "Weight seems too high")
  .multipleOf(0.1, "Weight must use 0.1 kg precision");

export const createWeightLogSchema = z.object({
  weightKg: weightKgSchema,
  note: z.string().trim().max(280).optional(),
  loggedAt: optionalWeightLoggedAt,
});

export const updateWeightLogSchema = z
  .object({
    weightKg: weightKgSchema.optional(),
    note: z.string().trim().max(280).optional(),
    loggedAt: optionalWeightLoggedAt,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one weight field must be provided.",
  });

export const weightLogIdParamsSchema = z.object({
  id: z.string().uuid("id must be a valid UUID."),
});

const micronutrientValueSchema = z.number().min(0).max(1_000_000);

export const micronutrientSnapshotSchema = z
  .object({
    calcium: micronutrientValueSchema.optional(),
    iron: micronutrientValueSchema.optional(),
    magnesium: micronutrientValueSchema.optional(),
    phosphorus: micronutrientValueSchema.optional(),
    potassium: micronutrientValueSchema.optional(),
    zinc: micronutrientValueSchema.optional(),
    copper: micronutrientValueSchema.optional(),
    manganese: micronutrientValueSchema.optional(),
    selenium: micronutrientValueSchema.optional(),
    iodine: micronutrientValueSchema.optional(),
    vitaminA: micronutrientValueSchema.optional(),
    vitaminC: micronutrientValueSchema.optional(),
    vitaminD: micronutrientValueSchema.optional(),
    vitaminE: micronutrientValueSchema.optional(),
    vitaminK: micronutrientValueSchema.optional(),
    thiamin: micronutrientValueSchema.optional(),
    riboflavin: micronutrientValueSchema.optional(),
    niacin: micronutrientValueSchema.optional(),
    vitaminB6: micronutrientValueSchema.optional(),
    folate: micronutrientValueSchema.optional(),
    vitaminB12: micronutrientValueSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "micronutrients must contain at least one canonical nutrient.",
  });

const consumedAmountFields = {
  consumedAmount: z.number().positive().max(5000).optional(),
  consumedUnit: z.enum(["g", "ml", "serving", "piece", "tsp", "tbsp"]).optional(),
} as const;

function hasCompleteConsumedAmount(value: { consumedAmount?: number; consumedUnit?: string }): boolean {
  return (value.consumedAmount === undefined) === (value.consumedUnit === undefined);
}

export const createMealLogSchema = z.object({
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
  name: z.string().trim().max(200).optional(),
  calories: z.number().min(0).max(20000).optional(),
  proteinG: z.number().min(0).max(2000).optional(),
  carbsG: z.number().min(0).max(2000).optional(),
  fatG: z.number().min(0).max(2000).optional(),
  sodiumMg: z.number().min(0).max(50000).optional(),
  sugarG: z.number().min(0).max(2000).optional(),
  micronutrients: micronutrientSnapshotSchema.optional(),
  ...consumedAmountFields,
  loggedAt: optionalLoggedAt,
}).refine(hasCompleteConsumedAmount, {
  message: "consumedAmount and consumedUnit must be provided together.",
});

export const updateMealLogSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    calories: z.number().min(0).max(20000).optional(),
    proteinG: z.number().min(0).max(2000).optional(),
    carbsG: z.number().min(0).max(2000).optional(),
    fatG: z.number().min(0).max(2000).optional(),
    sodiumMg: z.number().min(0).max(50000).optional(),
    sugarG: z.number().min(0).max(2000).optional(),
    micronutrients: micronutrientSnapshotSchema.optional(),
    ...consumedAmountFields,
  })
  .refine(hasCompleteConsumedAmount, {
    message: "consumedAmount and consumedUnit must be provided together.",
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one meal field must be provided.",
  });

export const mealLogIdParamsSchema = z.object({
  id: z.string().uuid("id must be a valid UUID."),
});

export const mealMicronutrientDayQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD."),
  timezone: z.string().trim().min(1).max(100),
});

export const createWaterLogSchema = z.object({
  amountMl: z.number().int().positive().max(10000),
  loggedAt: optionalLoggedAt,
});

export const waterLogIdParamsSchema = z.object({
  id: z.string().uuid("id must be a valid UUID."),
});

export const updateWaterGoalSchema = z.object({
  dailyWaterGoalMl: z.number().int().min(500).max(10000),
});

export const scheduleWaterReminderSchema = z.object({
  minutesFromNow: z.number().int().min(15).max(720),
});

export type CreateWeightLogInput = z.infer<typeof createWeightLogSchema>;
export type UpdateWeightLogInput = z.infer<typeof updateWeightLogSchema>;
export type CreateMealLogInput = z.infer<typeof createMealLogSchema>;
export type UpdateMealLogInput = z.infer<typeof updateMealLogSchema>;
export type MealMicronutrientDayQuery = z.infer<typeof mealMicronutrientDayQuerySchema>;
export type CreateWaterLogInput = z.infer<typeof createWaterLogSchema>;
export type UpdateWaterGoalInput = z.infer<typeof updateWaterGoalSchema>;
export type ScheduleWaterReminderInput = z.infer<typeof scheduleWaterReminderSchema>;
