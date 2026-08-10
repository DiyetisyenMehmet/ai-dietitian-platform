import type { NextFunction, Request, RequestHandler, Response } from "express";

import { ApiError } from "../utils/api-error";
import { CONSENT_REQUIRED_CODE } from "../modules/legal/constants";
import { legalService } from "../modules/legal/legal.service";

/**
 * Mandatory-consent guard (Sprint 15).
 *
 * Reusable infrastructure that blocks a route until the authenticated user has
 * granted (and kept up to date) every mandatory legal consent — privacy policy,
 * terms of service, medical disclaimer and KVKK explicit consent. On a missing
 * or stale consent a 403 is returned with the stable `CONSENT_REQUIRED` code and
 * the list of outstanding document types, so the client can drive the user
 * through the consent flow.
 *
 * Must be mounted after `authenticate`. Like the subscription guards, this is
 * provided as opt-in infrastructure and is not force-wired onto existing
 * Sprint 12–14 routes.
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
