import { z } from "zod";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "localDate must be a real calendar date.");
export const checkInDaySchema = z.object({
  planId: z.string().uuid(), dayNumber: z.coerce.number().int().min(1).max(60), localDate,
}).strict();
export const checkInParamsSchema = z.object({
  planId: z.string().uuid(),
  dayNumber: z.string().regex(/^[1-9]\d?$/).refine((v) => Number(v) <= 60),
  mealIndex: z.string().regex(/^(0|[1-9]\d?)$/).refine((v) => Number(v) <= 11),
}).strict();
export const checkInDateSchema = z.object({ localDate }).strict();
export const checkInEmptyBodySchema = z.object({}).strict().optional();
export const checkInRevisionSchema = z.string().regex(/^"(0|[1-9]\d{0,9})"$/)
  .transform((v) => Number(v.slice(1, -1)))
  .pipe(z.number().int().min(0).max(2_147_483_646));
export type CheckInDay = z.infer<typeof checkInDaySchema>;
export type CheckInIdentity = CheckInDay & { mealIndex: number };
