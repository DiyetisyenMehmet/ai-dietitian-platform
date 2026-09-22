import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { historyAiService } from "./history-ai.service";
import { historyComparisonService } from "./history-comparison";
import type {
  HistoryComparisonQuery,
  HistoryDayQuery,
  HistoryInsightBody,
} from "./history.schemas";
import { historyService } from "./history.service";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

export const historyController = {
  day: asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as HistoryDayQuery;
    const history = await historyService.getDay(requireUserId(req), query.date, query.timezone);
    sendSuccess(res, { history });
  }),

  comparison: asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as HistoryComparisonQuery;
    const userId = requireUserId(req);
    const comparison =
      query.mode === "custom"
        ? await historyComparisonService.getCustomComparison(
            userId,
            {
              period1Start: query.period1Start,
              period1End: query.period1End,
              period2Start: query.period2Start,
              period2End: query.period2End,
            },
            query.timezone,
          )
        : await historyComparisonService.getComparison(
            userId,
            query.period === "week" ? "WEEK" : "MONTH",
            query.referenceDate,
            query.timezone,
          );
    sendSuccess(res, { comparison });
  }),

  insight: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as HistoryInsightBody;
    const userId = requireUserId(req);
    const insight =
      body.scope === "DAY"
        ? await historyAiService.getDailyInsight(userId, body.date, body.timezone)
        : body.scope === "CUSTOM"
          ? await historyAiService.getCustomComparisonInsight(
              userId,
              {
                period1Start: body.period1Start,
                period1End: body.period1End,
                period2Start: body.period2Start,
                period2End: body.period2End,
              },
              body.timezone,
            )
          : await historyAiService.getPeriodInsight(
              userId,
              body.scope,
              body.referenceDate,
              body.timezone,
            );
    sendSuccess(res, { insight });
  }),
};
