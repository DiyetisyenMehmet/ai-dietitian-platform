import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import type { HistoryDayQuery } from "./history.schemas";
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
};
