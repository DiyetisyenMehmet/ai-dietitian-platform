import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { toPhotoScanResult } from "../nutrition-data/nutrition-scan-result";
import { analyzeConfirmedFoodName, applyFoodNutritionFallback } from "./food-scan-fallback";
import { foodScanService } from "./food-scan.service";
import type { FoodScanIngredientCorrection } from "./types";

export const foodScanController = {
  analyze: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized("Authentication required.");
    if (!req.file?.buffer) {
      throw ApiError.badRequest('"file" alanında bir görsel yüklemelisiniz.');
    }
    const deterministic = await foodScanService.analyze(req.file.buffer);
    const analysis = await applyFoodNutritionFallback(deterministic);
    sendSuccess(res, { analysis, scan: toPhotoScanResult(analysis) });
  }),

  analyzeByName: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized("Authentication required.");
    const body = req.body as { foodName?: unknown; grams?: unknown } | undefined;
    if (typeof body?.foodName !== "string" || body.foodName.trim().length < 2 || body.foodName.trim().length > 120) {
      throw ApiError.badRequest("Gıda adı 2-120 karakter olmalıdır.");
    }
    const grams = body.grams === undefined ? 100 : body.grams;
    if (typeof grams !== "number" || !Number.isFinite(grams) || grams <= 0 || grams > 5_000) {
      throw ApiError.badRequest("Porsiyon gramı 1-5000 aralığında olmalıdır.");
    }
    const analysis = await analyzeConfirmedFoodName(body.foodName, grams);
    sendSuccess(res, { analysis, scan: toPhotoScanResult(analysis) });
  }),

  recalculate: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized("Authentication required.");
    const body = req.body as { ingredients?: unknown; targetGrams?: unknown } | undefined;
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
    const targetGrams = body.targetGrams;
    if (targetGrams !== undefined && typeof targetGrams !== "number") {
      throw ApiError.badRequest("targetGrams number olmalıdır.");
    }
    const analysis = await foodScanService.recalculate(corrections, targetGrams);
    sendSuccess(res, { analysis });
  }),
};
