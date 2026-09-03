import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { validate } from "../../middleware/validate";
import { aiCoachController } from "./ai-coach.controller";
import {
  messageIdParamsSchema,
  monthlyReviewInputSchema,
  monthlyReviewQuerySchema,
  smartAnswerSchema,
  weeklyReviewInputSchema,
  weeklyReviewQuerySchema,
} from "./ai-coach.schemas";
import { requirePremium } from "./premium";

/**
 * AI Health Coach router (mounted at /api/ai-coach). Every route is owner-scoped
 * and requires a valid access token. Endpoints that derive, generate or record
 * health coaching data additionally require current mandatory consent. Pure
 * reads of already-persisted proactive messages/adaptations remain available.
 * Premium gating is applied per endpoint after consent where both are required.
 *
 * @openapi
 * tags:
 *   - name: AI Coach
 *     description: Proactive, memory-aware AI health coaching (Sprint 19).
 */
export const aiCoachRouter = Router();

// --- Proactive messages (Section 2) ---
aiCoachRouter.get("/proactive-messages", authenticate, aiCoachController.listProactiveMessages);
aiCoachRouter.patch(
  "/proactive-messages/:id/read",
  authenticate,
  validate({ params: messageIdParamsSchema }),
  aiCoachController.markProactiveMessageRead,
);

// --- Long-term memory (Section 1): context is dynamically derived from health data. ---
aiCoachRouter.get("/memory", authenticate, requireConsent, aiCoachController.getMemory);

// --- Smart question engine (Section 3) ---
aiCoachRouter.get("/progress-check", authenticate, requireConsent, aiCoachController.getProgressCheck);
aiCoachRouter.post(
  "/progress-check/answer",
  authenticate,
  requireConsent,
  validate({ body: smartAnswerSchema }),
  aiCoachController.answerProgressQuestion,
);

// --- Dynamic nutrition adaptation (Section 4). Reading the latest persisted
// adaptation remains available; running a new analysis requires consent + paid access. ---
aiCoachRouter.get("/nutrition-adaptation", authenticate, aiCoachController.getNutritionAdaptation);
aiCoachRouter.post(
  "/nutrition-adaptation/run",
  authenticate,
  requireConsent,
  requirePremium,
  aiCoachController.runNutritionAdaptation,
);

// --- Risk detection (Section 5): this computes fresh health-derived signals. ---
aiCoachRouter.get("/risks", authenticate, requireConsent, aiCoachController.getRisks);

// --- Weekly review (Section 6). GET can generate a missing review, so both
// retrieval and explicit generation require current consent. ---
aiCoachRouter.get(
  "/weekly-review",
  authenticate,
  requireConsent,
  validate({ query: weeklyReviewQuerySchema }),
  aiCoachController.getWeeklyReview,
);
aiCoachRouter.post(
  "/weekly-review/generate",
  authenticate,
  requireConsent,
  validate({ body: weeklyReviewInputSchema }),
  aiCoachController.generateWeeklyReview,
);

// --- Monthly review (Section 7). GET can generate a missing review. ---
aiCoachRouter.get(
  "/monthly-review",
  authenticate,
  requireConsent,
  requirePremium,
  validate({ query: monthlyReviewQuerySchema }),
  aiCoachController.getMonthlyReview,
);
aiCoachRouter.post(
  "/monthly-review/generate",
  authenticate,
  requireConsent,
  requirePremium,
  validate({ body: monthlyReviewInputSchema }),
  aiCoachController.generateMonthlyReview,
);
