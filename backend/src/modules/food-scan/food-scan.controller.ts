import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { foodScanService } from "./food-scan.service";

export const foodScanController = {
  analyze: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized("Authentication required.");
    if (!req.file?.buffer) {
      throw ApiError.badRequest('"file" alanında bir görsel yüklemelisiniz.');
    }
    const analysis = await foodScanService.analyze(req.file.buffer);
    sendSuccess(res, { analysis });
  }),
};
