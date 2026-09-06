import { z } from "zod";

import { SUPPORTED_PLAN_DURATIONS } from "../constants";

/**
 * Zod DTO schemas for the nutrition-plan endpoints. Single source of truth for
 * request validation; the `validate` middleware parses requests against these
 * and the service/controller consume the inferred types.
 */

/** Supported user-selectable plan durations. SIXTY_DAY is legacy read-only. */
export const PLAN_DURATIONS = SUPPORTED_PLAN_DURATIONS;

const planStartDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must use YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "startDate must be a valid calendar date");

/** Body for generating a new plan. The web/native client sends its local date. */
export const generatePlanSchema = z.object({
  duration: z.enum(PLAN_DURATIONS),
  startDate: planStartDateSchema.optional(),
});
export type GeneratePlanInput = z.infer<typeof generatePlanSchema>;

/** Route param: a nutrition-plan id (UUID). */
export const planIdParamSchema = z.object({
  id: z.string().uuid("A valid nutrition plan id is required"),
});
export type PlanIdParam = z.infer<typeof planIdParamSchema>;

/** Route params for a single adherence/deviation record. */
export const planDeviationParamSchema = z.object({
  id: z.string().uuid("A valid nutrition plan id is required"),
  deviationId: z.string().uuid("A valid deviation id is required"),
});
export type PlanDeviationParam = z.infer<typeof planDeviationParamSchema>;

/** Query for fetching the active plan of a given supported duration. */
export const activePlanQuerySchema = z.object({
  duration: z.enum(PLAN_DURATIONS),
});
export type ActivePlanQuery = z.infer<typeof activePlanQuerySchema>;

export const NUTRITION_PLAN_DEVIATION_SCOPES = ["FOOD", "MEAL", "DAY"] as const;
export const NUTRITION_PLAN_DEVIATION_TYPES = [
  "SKIPPED",
  "REPLACED",
  "EXTRA",
  "PORTION_CHANGED",
] as const;

/**
 * Body for recording a user-reported "Kaçamak". Planned item names/portions are
 * deliberately not accepted from the client; the service derives them from the
 * immutable plan snapshot to prevent inconsistent adherence history.
 */
export const createDeviationSchema = z
  .object({
    dayNumber: z.number().int().min(1).max(60),
    mealIndex: z.number().int().min(0).max(20).optional(),
    foodIndex: z.number().int().min(0).max(50).optional(),
    scope: z.enum(NUTRITION_PLAN_DEVIATION_SCOPES),
    type: z.enum(NUTRITION_PLAN_DEVIATION_TYPES),
    actualItemName: z.string().trim().min(1).max(120).optional(),
    actualPortion: z.string().trim().min(1).max(80).optional(),
    note: z.string().trim().max(240).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === "FOOD") {
      if (value.mealIndex === undefined || value.foodIndex === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Food-level deviations require mealIndex and foodIndex.",
        });
      }
      if (value.type === "EXTRA") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["type"],
          message: "Extra intake must be recorded at meal or day level.",
        });
      }
    }

    if (value.scope === "MEAL") {
      if (value.mealIndex === undefined || value.foodIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Meal-level deviations require mealIndex and no foodIndex.",
        });
      }
    }

    if (value.scope === "DAY" && (value.mealIndex !== undefined || value.foodIndex !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Day-level deviations cannot include mealIndex or foodIndex.",
      });
    }

    if (value.type === "PORTION_CHANGED") {
      if (value.scope !== "FOOD") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scope"],
          message: "Portion changes must target a planned food.",
        });
      }
      if (!value.actualPortion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actualPortion"],
          message: "The actual portion is required for a portion change.",
        });
      }
    }

    if (value.type === "REPLACED") {
      if (value.scope === "DAY") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scope"],
          message: "A replacement must target a planned food or meal.",
        });
      }
      if (!value.actualItemName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actualItemName"],
          message: "The replacement item is required.",
        });
      }
    }

    if (value.type === "EXTRA" && !value.actualItemName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualItemName"],
        message: "The extra item is required.",
      });
    }
  });
export type CreateDeviationInput = z.infer<typeof createDeviationSchema>;
