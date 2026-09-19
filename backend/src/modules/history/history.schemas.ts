import { z } from "zod";

export const historyDayQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD."),
  timezone: z.string().trim().max(100).optional(),
});

export type HistoryDayQuery = z.infer<typeof historyDayQuerySchema>;
