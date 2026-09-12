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

export const createWeightLogSchema = z.object({
  weightKg: z.number().positive().max(500),
  note: z.string().trim().max(280).optional(),
  loggedAt: optionalWeightLoggedAt,
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

export const updateMealLogSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    calories: z.number().min(0).max(20000).optional(),
    proteinG: z.number().min(0).max(2000).optional(),
    carbsG: z.number().min(0).max(2000).optional(),
    fatG: z.number().min(0).max(2000).optional(),
    sodiumMg: z.number().min(0).max(50000).optional(),
    sugarG: z.number().min(0).max(2000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one meal field must be provided.",
  });

export const mealLogIdParamsSchema = z.object({
  id: z.string().uuid("id must be a valid UUID."),
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
export type CreateMealLogInput = z.infer<typeof createMealLogSchema>;
export type UpdateMealLogInput = z.infer<typeof updateMealLogSchema>;
export type CreateWaterLogInput = z.infer<typeof createWaterLogSchema>;
export type UpdateWaterGoalInput = z.infer<typeof updateWaterGoalSchema>;
export type ScheduleWaterReminderInput = z.infer<typeof scheduleWaterReminderSchema>;
