import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
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
 * and requires a valid access token. Premium gating is applied per-endpoint:
 * monthly review and dynamic-adaptation runs require premium (HTTP 402), while
 * weekly review and risks degrade to a simplified view for free users.
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

// --- Long-term memory (Section 1) ---
aiCoachRouter.get("/memory", authenticate, aiCoachController.getMemory);

// --- Smart question engine (Section 3) ---
aiCoachRouter.get("/progress-check", authenticate, aiCoachController.getProgressCheck);
aiCoachRouter.post(
  "/progress-check/answer",
  authenticate,
  validate({ body: smartAnswerSchema }),
  aiCoachController.answerProgressQuestion,
);

// --- Dynamic nutrition adaptation (Section 4). Running an adaptation is a
// premium capability; reading the latest recorded adaptation is open. ---
aiCoachRouter.get("/nutrition-adaptation", authenticate, aiCoachController.getNutritionAdaptation);
aiCoachRouter.post(
  "/nutrition-adaptation/run",
  authenticate,
  requirePremium,
  aiCoachController.runNutritionAdaptation,
);

// --- Risk detection (Section 5). Free users see high-severity only. ---
aiCoachRouter.get("/risks", authenticate, aiCoachController.getRisks);

// --- Weekly review (Section 6). Simplified for free users. ---
aiCoachRouter.get(
  "/weekly-review",
  authenticate,
  validate({ query: weeklyReviewQuerySchema }),
  aiCoachController.getWeeklyReview,
);
aiCoachRouter.post(
  "/weekly-review/generate",
  authenticate,
  validate({ body: weeklyReviewInputSchema }),
  aiCoachController.generateWeeklyReview,
);

// --- Monthly review (Section 7). PREMIUM only (hard 402). ---
aiCoachRouter.get(
  "/monthly-review",
  authenticate,
  requirePremium,
  validate({ query: monthlyReviewQuerySchema }),
  aiCoachController.getMonthlyReview,
);
aiCoachRouter.post(
  "/monthly-review/generate",
  authenticate,
  requirePremium,
  validate({ body: monthlyReviewInputSchema }),
  aiCoachController.generateMonthlyReview,
);
