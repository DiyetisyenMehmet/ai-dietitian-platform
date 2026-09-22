import { z } from "zod";

const historyDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD.");
const historyTimezoneSchema = z.string().trim().max(100).optional();

export const historyDayQuerySchema = z.object({
  date: historyDateSchema,
  timezone: historyTimezoneSchema,
});

const standardHistoryComparisonQuerySchema = z.object({
  mode: z.literal("standard").optional(),
  period: z.enum(["week", "month"]),
  referenceDate: historyDateSchema,
  timezone: historyTimezoneSchema,
});

const customHistoryComparisonQuerySchema = z.object({
  mode: z.literal("custom"),
  period1Start: historyDateSchema,
  period1End: historyDateSchema,
  period2Start: historyDateSchema,
  period2End: historyDateSchema,
  timezone: historyTimezoneSchema,
});

export const historyComparisonQuerySchema = z.union([
  standardHistoryComparisonQuerySchema,
  customHistoryComparisonQuerySchema,
]);

export type HistoryDayQuery = z.infer<typeof historyDayQuerySchema>;
export type HistoryComparisonQuery = z.infer<typeof historyComparisonQuerySchema>;

const historyDayInsightBodySchema = z.object({
  scope: z.literal("DAY"),
  date: historyDateSchema,
  timezone: historyTimezoneSchema,
});

const historyPeriodInsightBodySchema = z.object({
  scope: z.enum(["WEEK", "MONTH"]),
  referenceDate: historyDateSchema,
  timezone: historyTimezoneSchema,
});

const historyCustomInsightBodySchema = z.object({
  scope: z.literal("CUSTOM"),
  period1Start: historyDateSchema,
  period1End: historyDateSchema,
  period2Start: historyDateSchema,
  period2End: historyDateSchema,
  timezone: historyTimezoneSchema,
});

export const historyInsightBodySchema = z.union([
  historyDayInsightBodySchema,
  historyPeriodInsightBodySchema,
  historyCustomInsightBodySchema,
]);

export type HistoryInsightBody = z.infer<typeof historyInsightBodySchema>;
