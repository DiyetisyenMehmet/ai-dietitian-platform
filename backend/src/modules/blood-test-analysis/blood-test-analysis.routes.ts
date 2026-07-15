import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { bloodTestAnalysisController } from "./blood-test-analysis.controller";
import { bloodTestIdParamSchema } from "./dto/blood-test-analysis.schemas";

/**
 * Blood-test analysis router (mounted at /api/blood-tests, BEFORE the Sprint 11
 * upload router so `/analyses` and `/:id/analysis(e)` resolve here first). Every
 * route requires a valid access token; the service scopes all access by owner.
 */
export const bloodTestAnalysisRouter = Router();

/**
 * @openapi
 * /api/blood-tests/analyses:
 *   get:
 *     tags: [BloodTestAnalysis]
 *     summary: List the authenticated user's blood-test analyses
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The user's analyses, newest first. }
 *       401: { description: Missing or invalid access token. }
 */
bloodTestAnalysisRouter.get("/analyses", authenticate, bloodTestAnalysisController.list);

/**
 * @openapi
 * /api/blood-tests/{id}/analyze:
 *   post:
 *     tags: [BloodTestAnalysis]
 *     summary: Run AI analysis for an uploaded blood test
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201: { description: The completed analysis record. }
 *       401: { description: Missing or invalid access token. }
 *       404: { description: Upload not found or not owned by the caller. }
 */
bloodTestAnalysisRouter.post(
  "/:id/analyze",
  authenticate,
  validate({ params: bloodTestIdParamSchema }),
  bloodTestAnalysisController.analyze,
);

/**
 * @openapi
 * /api/blood-tests/{id}/analysis:
 *   get:
 *     tags: [BloodTestAnalysis]
 *     summary: Get the analysis result for an uploaded blood test
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: The analysis record. }
 *       401: { description: Missing or invalid access token. }
 *       404: { description: No analysis found for this blood test. }
 */
bloodTestAnalysisRouter.get(
  "/:id/analysis",
  authenticate,
  validate({ params: bloodTestIdParamSchema }),
  bloodTestAnalysisController.getAnalysis,
);
