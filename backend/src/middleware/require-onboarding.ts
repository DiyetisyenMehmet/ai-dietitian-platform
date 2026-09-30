import type { NextFunction, Request, RequestHandler, Response } from "express";

import { ApiError } from "../utils/api-error";

/**
 * Server-side first-run gate for normal application features.
 *
 * Authentication runs before this middleware and loads the current User row, so
 * completion changes become effective on the very next request without waiting
 * for an access-token refresh. Guest identity keeps its existing per-route
 * capability rules; full accounts must finish onboarding first.
 */
export const requireOnboardingCompleted: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    next(ApiError.unauthorized("Authentication required."));
    return;
  }

  if (req.user.isGuest || req.user.onboardingCompleted) {
    next();
    return;
  }

  next(
    new ApiError(403, "Complete onboarding before using this feature.", {
      code: "ONBOARDING_REQUIRED",
    }),
  );
};
