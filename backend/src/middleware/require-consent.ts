import type { NextFunction, Request, RequestHandler, Response } from "express";

import { ApiError } from "../utils/api-error";
import { CONSENT_REQUIRED_CODE } from "../modules/legal/constants";
import { legalService } from "../modules/legal/legal.service";

/**
 * Health-data/AI processing consent guard.
 *
 * Global onboarding consents and the current health-data explicit consent are
 * both required on routes that create or newly process health data. Read/delete
 * routes intentionally stay available after withdrawal so users can access or
 * delete data Diewish already holds about them.
 */
export const requireConsent: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    next(ApiError.unauthorized("Authentication required."));
    return;
  }

  legalService
    .getMissingConsents(req.user.id, ["KVKK_EXPLICIT_CONSENT"])
    .then((missing) => {
      if (missing.length > 0) {
        next(
          new ApiError(403, "Required legal consents must be accepted before continuing.", {
            code: CONSENT_REQUIRED_CODE,
            details: { missingConsents: missing },
          }),
        );
        return;
      }
      next();
    })
    .catch(next);
};
