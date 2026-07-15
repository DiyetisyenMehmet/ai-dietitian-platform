import { z } from "zod";

/**
 * Zod DTO schemas for the nutrition-plan endpoints. Single source of truth for
 * request validation; the `validate` middleware parses requests against these
 * and the service/controller consume the inferred types.
 */

/** Supported plan durations (mirrors the Prisma `NutritionPlanDuration` enum). */
export const PLAN_DURATIONS = ["THIRTY_DAY", "SIXTY_DAY"] as const;

/** Body for generating a new plan. */
export const generatePlanSchema = z.object({
  duration: z.enum(PLAN_DURATIONS),
});
export type GeneratePlanInput = z.infer<typeof generatePlanSchema>;

/** Route param: a nutrition-plan id (UUID). */
export const planIdParamSchema = z.object({
  id: z.string().uuid("A valid nutrition plan id is required"),
});
export type PlanIdParam = z.infer<typeof planIdParamSchema>;

/** Query for fetching the active plan of a given duration. */
export const activePlanQuerySchema = z.object({
  duration: z.enum(PLAN_DURATIONS),
});
export type ActivePlanQuery = z.infer<typeof activePlanQuerySchema>;
