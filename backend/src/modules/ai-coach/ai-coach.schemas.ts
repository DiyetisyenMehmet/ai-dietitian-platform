import { z } from "zod";

import { QUESTION_CATEGORIES } from "./smart-question.engine";

/**
 * Validation schemas for the AI Health Coach endpoints (Sprint 19). Inputs are
 * validated defensively so bad clients cannot corrupt memory or reviews.
 */

const currentYear = new Date().getUTCFullYear();

/** Path param: a proactive message id (UUID). */
export const messageIdParamsSchema = z.object({
  id: z.string().uuid("Geçersiz mesaj kimliği."),
});

/** Body for generating/reading a weekly review (week/year optional → current). */
export const weeklyReviewInputSchema = z.object({
  weekNumber: z.number().int().min(1).max(53).optional(),
  year: z
    .number()
    .int()
    .min(2020)
    .max(currentYear + 1)
    .optional(),
});

/** Query for reading a weekly review. */
export const weeklyReviewQuerySchema = z.object({
  weekNumber: z.coerce.number().int().min(1).max(53).optional(),
  year: z.coerce
    .number()
    .int()
    .min(2020)
    .max(currentYear + 1)
    .optional(),
});

/** Body for generating a monthly review (month/year optional → current). */
export const monthlyReviewInputSchema = z.object({
  month: z.number().int().min(1).max(12).optional(),
  year: z
    .number()
    .int()
    .min(2020)
    .max(currentYear + 1)
    .optional(),
});

/** Query for reading a monthly review. */
export const monthlyReviewQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce
    .number()
    .int()
    .min(2020)
    .max(currentYear + 1)
    .optional(),
});

const CATEGORY_KEYS = QUESTION_CATEGORIES.map((c) => c.key) as [string, ...string[]];

/** Body for answering a smart investigative question. */
export const smartAnswerSchema = z.object({
  category: z.enum(CATEGORY_KEYS),
  answer: z.string().trim().min(1).max(1000),
});

export type WeeklyReviewInput = z.infer<typeof weeklyReviewInputSchema>;
export type MonthlyReviewInput = z.infer<typeof monthlyReviewInputSchema>;
export type SmartAnswerInput = z.infer<typeof smartAnswerSchema>;
