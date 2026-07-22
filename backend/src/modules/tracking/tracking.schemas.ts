import { z } from "zod";

/**
 * Validation schemas for the Sprint 19 tracking domain (weight / meals / water).
 *
 * These lightweight logs are the time-series data sources the AI Health Coach
 * reasons over (trends, consistency, risk). Inputs are validated defensively so
 * a bad client cannot poison the coach's signals.
 */

/** Optional ISO timestamp; defaults to "now" when omitted. */
const optionalLoggedAt = z
  .string()
  .datetime({ message: "loggedAt must be an ISO-8601 datetime string." })
  .optional();

export const createWeightLogSchema = z.object({
  weightKg: z.number().positive().max(500),
  note: z.string().trim().max(280).optional(),
  loggedAt: optionalLoggedAt,
});

export const createMealLogSchema = z.object({
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
  name: z.string().trim().max(200).optional(),
  calories: z.number().min(0).max(20000).optional(),
  proteinG: z.number().min(0).max(2000).optional(),
  carbsG: z.number().min(0).max(2000).optional(),
  fatG: z.number().min(0).max(2000).optional(),
  sodiumMg: z.number().min(0).max(50000).optional(),
  sugarG: z.number().min(0).max(2000).optional(),
  loggedAt: optionalLoggedAt,
});

export const createWaterLogSchema = z.object({
  amountMl: z.number().int().positive().max(10000),
  loggedAt: optionalLoggedAt,
});

export type CreateWeightLogInput = z.infer<typeof createWeightLogSchema>;
export type CreateMealLogInput = z.infer<typeof createMealLogSchema>;
export type CreateWaterLogInput = z.infer<typeof createWaterLogSchema>;
