import type { NextFunction, Request, RequestHandler, Response } from "express";

import { trackingService } from "../modules/tracking/tracking.service";
import { ApiError } from "../utils/api-error";

/**
 * Blocks only operations that recalculate nutrition targets/content when the
 * user's backend-owned weekly weigh-in is due. Existing plans, history,
 * adherence, hunger coaching and calendar continuity remain accessible.
 */
export const requireCurrentWeightCheckIn: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    next(ApiError.unauthorized("Authentication required."));
    return;
  }

  trackingService.requireCurrentWeightCheckIn(req.user.id).then(() => next()).catch(next);
};
