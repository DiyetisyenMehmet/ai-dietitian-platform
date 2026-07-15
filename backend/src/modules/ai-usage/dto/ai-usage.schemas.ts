import { z } from "zod";

/**
 * Validation schemas for the AI usage endpoints (Sprint 14, C5).
 */

/** Optional feature filter for the usage-status query. */
export const usageQuerySchema = z.object({
  feature: z.enum(["DIETITIAN_CHAT", "BLOOD_TEST_ANALYSIS", "NUTRITION_PLAN"]).optional(),
});

export type UsageQuery = z.infer<typeof usageQuerySchema>;
