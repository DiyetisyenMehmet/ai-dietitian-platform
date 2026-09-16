import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendNoContent, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import type { UpdateWeightLogInput } from "./tracking.schemas";
import { weightEntryService } from "./weight-entry.service";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

export const weightEntryController = {
  get: asyncHandler(async (req: Request, res: Response) => {
    const log = await weightEntryService.get(requireUserId(req), req.params.id);
    sendSuccess(res, { log });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const log = await weightEntryService.update(
      requireUserId(req),
      req.params.id,
      req.body as UpdateWeightLogInput,
    );
    sendSuccess(res, { log });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    await weightEntryService.delete(requireUserId(req), req.params.id);
    sendNoContent(res);
  }),
};
