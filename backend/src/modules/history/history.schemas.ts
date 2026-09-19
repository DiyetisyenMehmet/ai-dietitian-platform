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
