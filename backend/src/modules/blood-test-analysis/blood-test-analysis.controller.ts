import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendCreated, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { bloodTestAnalysisService } from "./blood-test-analysis.service";
import type { BloodTestIdParam } from "./dto/blood-test-analysis.schemas";

/** Resolves the authenticated user id or throws 401. */
function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return req.user.id;
}

/**
 * Controller for Diewish's AI Blood Test Analysis Engine endpoints.
 */
export const bloodTestAnalysisController = {
  /**
   * Triggers analysis of an already-uploaded blood test and returns the
   * resulting analysis record. The pipeline runs synchronously in this
   * codebase (no job queue), so the full result is returned on completion.
   */
  analyze: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as BloodTestIdParam;
    const analysis = await bloodTestAnalysisService.analyze(userId, id);
    sendCreated(res, { analysis });
  }),

  /** Returns the analysis for a given uploaded blood test. */
  getAnalysis: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as BloodTestIdParam;
    const analysis = await bloodTestAnalysisService.getByBloodTestId(userId, id);
    sendSuccess(res, { analysis });
  }),

  /** Lists all analyses for the authenticated user. */
  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const analyses = await bloodTestAnalysisService.list(userId);
    sendSuccess(res, { analyses });
  }),
};
