import { z } from "zod";

export const historyDayQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD."),
  timezone: z.string().trim().max(100).optional(),
});

export const historyComparisonQuerySchema = z.object({
  period: z.enum(["week", "month"]),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "referenceDate must use YYYY-MM-DD."),
  timezone: z.string().trim().max(100).optional(),
});

export type HistoryDayQuery = z.infer<typeof historyDayQuerySchema>;
export type HistoryComparisonQuery = z.infer<typeof historyComparisonQuerySchema>;


export const historyInsightBodySchema = z
  .object({
    scope: z.enum(["DAY", "WEEK", "MONTH"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD.").optional(),
    referenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "referenceDate must use YYYY-MM-DD.")
      .optional(),
    timezone: z.string().trim().max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "DAY" && !value.date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "date is required for DAY.",
      });
    }
    if (value.scope !== "DAY" && !value.referenceDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referenceDate"],
        message: "referenceDate is required for WEEK/MONTH.",
      });
    }
  });

export type HistoryInsightBody = z.infer<typeof historyInsightBodySchema>;
