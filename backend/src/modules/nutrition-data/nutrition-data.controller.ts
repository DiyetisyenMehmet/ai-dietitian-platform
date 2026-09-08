import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { nutritionDataService } from "./nutrition-data.service";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

function parsedLimit(req: Request, fallback: number): number {
  return typeof req.query.limit === "string" ? Number(req.query.limit) : fallback;
}

export const nutritionDataController = {
  search: asyncHandler(async (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const foods = await nutritionDataService.search(query, parsedLimit(req, 10));
    sendSuccess(res, { foods, sourcePolicy: "DIEWISH_CACHE_THEN_USDA" });
  }),

  barcode: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const barcode = req.params.barcode ?? "";
    const food = await nutritionDataService.getByBarcode(barcode);
    await nutritionDataService.recordBarcodeScan(userId, barcode, food);
    sendSuccess(res, {
      found: food !== null,
      food,
      sourcePolicy: "DIEWISH_CACHE_THEN_OPEN_FOOD_FACTS_THEN_USDA_BRANDED",
    });
  }),

  history: asyncHandler(async (req: Request, res: Response) => {
    const scans = await nutritionDataService.listRecentScans(requireUserId(req), parsedLimit(req, 20));
    sendSuccess(res, { scans });
  }),

  favorites: asyncHandler(async (req: Request, res: Response) => {
    const favorites = await nutritionDataService.listFavorites(requireUserId(req), parsedLimit(req, 50));
    sendSuccess(res, { favorites });
  }),

  setFavorite: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const favorite = (req.body as { favorite?: unknown } | undefined)?.favorite;
    if (typeof favorite !== "boolean") throw ApiError.badRequest("favorite boolean olmalıdır.");
    const food = await nutritionDataService.setFavorite(userId, req.params.barcode ?? "", favorite);
    sendSuccess(res, { favorite, food });
  }),
};
