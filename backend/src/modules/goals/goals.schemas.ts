import { z } from "zod";

export const GOAL_TYPES = [
  "lose-weight",
  "gain-weight",
  "maintain-weight",
  "daily-calories",
  "protein",
  "water",
  "steps",
  "exercise",
] as const;

export const WRITABLE_GOAL_TYPES = [
  "lose-weight",
  "gain-weight",
  "maintain-weight",
  "daily-calories",
  "protein",
  "water",
  "exercise",
] as const;

export type GoalType = (typeof GOAL_TYPES)[number];

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD.")
  .refine((value) => !Number.isNaN(Date.parse(value + "T00:00:00.000Z")), "Date is invalid.");

const goalWriteSchema = z
  .object({
    type: z.enum(WRITABLE_GOAL_TYPES),
    title: z.string().trim().max(80).optional().default(""),
    targetValue: z.number().finite().positive().max(100000),
    startDate: isoDateSchema,
    targetDate: isoDateSchema,
    reminderTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional()
      .or(z.literal("")),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.targetDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetDate"],
        message: "Target date must not be before start date.",
      });
    }
  });

export const createGoalSchema = goalWriteSchema;
export const updateGoalSchema = goalWriteSchema;

export const goalIdParamsSchema = z.object({
  id: z.string().uuid("id must be a valid UUID."),
});

export const goalQuerySchema = z.object({
  timezone: z.string().trim().min(1).max(100).optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type GoalQuery = z.infer<typeof goalQuerySchema>;
