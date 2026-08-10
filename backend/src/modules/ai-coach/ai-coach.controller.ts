import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendCreated, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { aiMemoryService } from "./ai-memory.service";
import { getIsoWeek } from "./metrics";
import { monthlyReviewService } from "./monthly-review.service";
import { nutritionAdaptationService } from "./nutrition-adaptation.service";
import { isUserPremium } from "./premium";
import { proactiveAiService } from "./proactive-ai.service";
import { riskDetectionService } from "./risk-detection.service";
import { smartQuestionEngine } from "./smart-question.engine";
import { weeklyReviewService } from "./weekly-review.service";
import type { MonthlyReviewInput, SmartAnswerInput, WeeklyReviewInput } from "./ai-coach.schemas";

/** Resolves the authenticated user id or throws 401. */
function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return req.user.id;
}

/**
 * Controller for the AI Health Coach surface (Sprint 19). Premium gating is
 * applied per-endpoint: some routes use the `requirePremium` middleware (hard
 * 402), while others (weekly review, risks) degrade gracefully to a simplified
 * view for free users.
 */
export const aiCoachController = {
  // --- Proactive messages (Section 2) ---
  listProactiveMessages: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const onlyUnread = req.query.unread === "true";
    const messages = await proactiveAiService.listMessages(userId, onlyUnread);
    sendSuccess(res, { messages });
  }),

  markProactiveMessageRead: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const message = await proactiveAiService.markRead(userId, req.params.id);
    if (!message) {
      throw ApiError.notFound("Mesaj bulunamadı.");
    }
    sendSuccess(res, { message });
  }),

  // --- Memory (Section 1) ---
  getMemory: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const premium = await isUserPremium(userId);
    const context = await aiMemoryService.buildMemoryContext(userId, premium);
    const entries = await aiMemoryService.getRelevantMemory(userId, { limit: 20 });
    sendSuccess(res, { premium, context, entries });
  }),

  // --- Smart question engine (Section 3) ---
  getProgressCheck: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const decline = await smartQuestionEngine.detectProgressDecline(userId);
    const questionBlock = decline.declined ? smartQuestionEngine.buildQuestionBlock(decline) : null;
    sendSuccess(res, { decline, questionBlock });
  }),

  answerProgressQuestion: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { category, answer } = req.body as SmartAnswerInput;
    const memory = await smartQuestionEngine.recordAnswer(userId, category, answer);
    sendCreated(res, { recorded: true, memoryId: memory.id });
  }),

  // --- Dynamic nutrition adaptation (Section 4) ---
  getNutritionAdaptation: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const latest = await nutritionAdaptationService.getLatestAdaptation(userId);
    sendSuccess(res, { adaptation: latest });
  }),

  runNutritionAdaptation: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const result = await nutritionAdaptationService.analyzeAndAdapt(userId);
    sendSuccess(res, { adaptation: result });
  }),

  // --- Risk detection (Section 5) ---
  getRisks: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const premium = await isUserPremium(userId);
    const risks = await riskDetectionService.detectRisks(userId);
    // Free users only see high-severity risks; premium users see everything.
    const visible = premium ? risks : risks.filter((r) => r.severity === "high");
    sendSuccess(res, { premium, risks: visible, total: risks.length });
  }),

  // --- Weekly review (Section 6) ---
  getWeeklyReview: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const premium = await isUserPremium(userId);
    const query = req.query as { weekNumber?: number; year?: number };
    const iso =
      query.weekNumber && query.year
        ? { weekNumber: query.weekNumber, year: query.year }
        : getIsoWeek();

    let review = await weeklyReviewService.getWeeklyReview(userId, iso.weekNumber, iso.year);
    if (!review) {
      review = await weeklyReviewService.generateWeeklyReview(userId, iso.weekNumber, iso.year);
    }
    if (premium) {
      sendSuccess(res, { premium, review });
      return;
    }
    sendSuccess(res, { premium, review: weeklyReviewService.toSimplified(review) });
  }),

  generateWeeklyReview: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const premium = await isUserPremium(userId);
    const { weekNumber, year } = req.body as WeeklyReviewInput;
    const review = await weeklyReviewService.generateWeeklyReview(userId, weekNumber, year);
    if (premium) {
      sendCreated(res, { premium, review });
      return;
    }
    sendCreated(res, { premium, review: weeklyReviewService.toSimplified(review) });
  }),

  // --- Monthly review (Section 7) — PREMIUM only (route-gated) ---
  getMonthlyReview: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const now = new Date();
    const query = req.query as { month?: number; year?: number };
    const month = query.month ?? now.getUTCMonth() + 1;
    const year = query.year ?? now.getUTCFullYear();

    let review = await monthlyReviewService.getMonthlyReview(userId, month, year);
    if (!review) {
      review = await monthlyReviewService.generateMonthlyReview(userId, month, year);
    }
    sendSuccess(res, { review });
  }),

  generateMonthlyReview: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { month, year } = req.body as MonthlyReviewInput;
    const review = await monthlyReviewService.generateMonthlyReview(userId, month, year);
    sendCreated(res, { review });
  }),
};
