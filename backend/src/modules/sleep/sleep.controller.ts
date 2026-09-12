import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendCreated, sendNoContent, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { sleepService } from "./sleep.service";
import type { CreateSleepInput, UpdateSleepInput } from "./sleep.schemas";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

function parseSince(req: Request): Date | undefined {
  const raw = req.query.since;
  if (typeof raw !== "string" || !raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw ApiError.badRequest("since must be a valid ISO datetime.");
  return parsed;
}

function parseTimezoneOffset(req: Request): number {
  const raw = req.query.timezoneOffsetMinutes;
  if (raw === undefined) return 0;
  if (typeof raw !== "string" || !/^-?\d+$/.test(raw)) {
    throw ApiError.badRequest("timezoneOffsetMinutes must be an integer.");
  }
  return Number(raw);
}

function localDateToday(timezoneOffsetMinutes: number): string {
  const localNow = new Date(Date.now() - timezoneOffsetMinutes * 60_000);
  return localNow.toISOString().slice(0, 10);
}

function parseDate(req: Request, key: "date" | "endDate", timezoneOffsetMinutes: number): string {
  const raw = req.query[key];
  if (raw === undefined) return localDateToday(timezoneOffsetMinutes);
  if (typeof raw !== "string") throw ApiError.badRequest(`${key} must use YYYY-MM-DD format.`);
  return raw;
}

export const sleepController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const sleep = await sleepService.create(requireUserId(req), req.body as CreateSleepInput);
    sendCreated(res, { sleep });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const sleeps = await sleepService.list(requireUserId(req), parseSince(req));
    sendSuccess(res, { sleeps });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const sleep = await sleepService.update(requireUserId(req), req.params.id, req.body as UpdateSleepInput);
    sendSuccess(res, { sleep });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await sleepService.remove(requireUserId(req), req.params.id);
    sendNoContent(res);
  }),

  dailyAssessment: asyncHandler(async (req: Request, res: Response) => {
    const offset = parseTimezoneOffset(req);
    const assessment = await sleepService.getDailyAssessment(
      requireUserId(req),
      parseDate(req, "date", offset),
      offset,
    );
    sendSuccess(res, { assessment });
  }),

  weeklyAnalysis: asyncHandler(async (req: Request, res: Response) => {
    const offset = parseTimezoneOffset(req);
    const analysis = await sleepService.getWeeklyAnalysis(
      requireUserId(req),
      parseDate(req, "endDate", offset),
      offset,
    );
    sendSuccess(res, { analysis });
  }),

  aiComment: asyncHandler(async (req: Request, res: Response) => {
    const offset = parseTimezoneOffset(req);
    const result = await sleepService.generateAiComment(
      requireUserId(req),
      parseDate(req, "endDate", offset),
      offset,
    );
    sendSuccess(res, result);
  }),
};
