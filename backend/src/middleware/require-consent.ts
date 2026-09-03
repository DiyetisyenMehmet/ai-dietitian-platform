import type { NextFunction, Request, RequestHandler, Response } from "express";

import { ApiError } from "../utils/api-error";
import { CONSENT_REQUIRED_CODE } from "../modules/legal/constants";
import { legalService } from "../modules/legal/legal.service";

/**
 * Mandatory-consent guard (Sprint 15).
 *
 * Blocks health-data writes and AI/analysis operations until the authenticated
 * user has granted the current versions of every mandatory legal document —
 * privacy policy, terms of service, medical disclaimer and KVKK explicit
 * consent. On a missing or stale consent a 403 is returned with the stable
 * `CONSENT_REQUIRED` code and the outstanding document types.
 *
 * Mount this after `authenticate` and before validation/business logic on routes
 * that create or newly process health data. Read/delete routes intentionally do
 * not use this guard so withdrawing consent does not prevent a user from
 * accessing or deleting data that Diewish already holds about them.
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
    .getMissingMandatoryConsents(req.user.id)
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
