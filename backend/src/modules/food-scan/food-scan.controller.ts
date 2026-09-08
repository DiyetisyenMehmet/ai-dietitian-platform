import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { foodScanService } from "./food-scan.service";
import type { FoodScanIngredientCorrection } from "./types";

export const foodScanController = {
  analyze: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized("Authentication required.");
    if (!req.file?.buffer) {
      throw ApiError.badRequest('"file" alanında bir görsel yüklemelisiniz.');
    }
    const analysis = await foodScanService.analyze(req.file.buffer);
    sendSuccess(res, { analysis });
  }),

  recalculate: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized("Authentication required.");
    const body = req.body as { ingredients?: unknown } | undefined;
    if (!Array.isArray(body?.ingredients)) {
      throw ApiError.badRequest("ingredients bir dizi olmalıdır.");
    }
    const corrections = body.ingredients.map((value) => {
      if (!value || typeof value !== "object") throw ApiError.badRequest("Geçersiz malzeme.");
      const item = value as Record<string, unknown>;
      if (typeof item.name !== "string" || typeof item.grams !== "number" || typeof item.included !== "boolean") {
        throw ApiError.badRequest("Her malzeme name, grams ve included alanlarını içermelidir.");
      }
      return { name: item.name, grams: item.grams, included: item.included } satisfies FoodScanIngredientCorrection;
    });
    const analysis = await foodScanService.recalculate(corrections);
    sendSuccess(res, { analysis });
  }),
};
