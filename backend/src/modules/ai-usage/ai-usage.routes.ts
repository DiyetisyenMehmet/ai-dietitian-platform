import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { aiUsageController } from "./ai-usage.controller";
import { usageQuerySchema } from "./dto/ai-usage.schemas";

/**
 * AI usage router (mounted at /api/ai-usage). Read-only quota visibility for the
 * authenticated user; all access is owner-scoped.
 */
export const aiUsageRouter = Router();

/**
 * @openapi
 * /api/ai-usage:
 *   get:
 *     tags: [AiUsage]
 *     summary: Get the caller's AI usage quota status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: feature
 *         required: false
 *         schema: { type: string, enum: [DIETITIAN_CHAT, BLOOD_TEST_ANALYSIS, NUTRITION_PLAN] }
 *     responses:
 *       200: { description: Per-feature daily/monthly usage and remaining allowance. }
 *       401: { description: Missing or invalid access token. }
 */
aiUsageRouter.get(
  "/",
  authenticate,
  validate({ query: usageQuerySchema }),
  aiUsageController.getStatus,
);
