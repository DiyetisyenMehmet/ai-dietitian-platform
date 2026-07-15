import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { onboardingService } from "./onboarding.service";
import type { OnboardingInput } from "./onboarding.schemas";

export const onboardingController = {
  /** Returns the authenticated user's onboarding profile (null when pending). */
  getProfile: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized("Authentication required.");
    }
    const profile = await onboardingService.getProfile(req.user.id);
    sendSuccess(res, { profile });
  }),

  /** Persists the mandatory onboarding profile and unlocks the app. */
  complete: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized("Authentication required.");
    }
    const input = req.body as OnboardingInput;
    const result = await onboardingService.completeOnboarding(req.user.id, input);
    sendSuccess(res, result);
  }),
};
