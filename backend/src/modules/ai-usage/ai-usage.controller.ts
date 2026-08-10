import type { Request, Response } from "express";
import type { AiUsageFeature } from "@prisma/client";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { aiUsageService } from "./ai-usage.service";
import type { UsageQuery } from "./dto/ai-usage.schemas";

/** Resolves the authenticated user id or throws 401. */
function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return req.user.id;
}

/** All AI features exposed in the usage summary. */
const ALL_FEATURES: AiUsageFeature[] = [
  "DIETITIAN_CHAT",
  "BLOOD_TEST_ANALYSIS",
  "NUTRITION_PLAN",
];

/**
 * Controller for AI usage/quota visibility. Read-only: clients use this to show
 * remaining allowance and upgrade prompts. Enforcement happens inside each AI
 * feature's service via {@link aiUsageService.assertWithinQuota}.
 */
export const aiUsageController = {
  /** Returns quota status for the user (all features, or a single feature). */
  getStatus: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { feature } = req.query as unknown as UsageQuery;

    const tier = await aiUsageService.resolveTier(userId);
    const features = feature ? [feature] : ALL_FEATURES;
    const usage = await Promise.all(
      features.map((f) => aiUsageService.getStatus(userId, f, tier)),
    );

    sendSuccess(res, { tier, usage });
  }),
};
