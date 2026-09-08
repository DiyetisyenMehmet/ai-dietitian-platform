import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { nutritionDataService } from "./nutrition-data.service";
import { nutritionPersonalizationService } from "./nutrition-personalization.service";
import type { NutrientValues } from "./nutrition-data.types";

const NUTRIENT_KEYS = [
  "energyKcal",
  "proteinG",
  "carbohydratesG",
  "fatG",
  "saturatedFatG",
  "sugarsG",
  "fiberG",
  "sodiumMg",
  "saltG",
] as const satisfies readonly (keyof NutrientValues)[];

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

function parsedLimit(req: Request, fallback: number): number {
  const value = typeof req.query.limit === "string" ? Number(req.query.limit) : fallback;
  return Number.isFinite(value) ? value : fallback;
}

function parseNutrients(value: unknown): NutrientValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw ApiError.badRequest("nutrients geçerli bir nesne olmalıdır.");
  }
  const record = value as Record<string, unknown>;
  const result: Partial<Record<keyof NutrientValues, number | null>> = {};
  for (const key of NUTRIENT_KEYS) {
    const nutrient = record[key];
    if (nutrient !== null && (typeof nutrient !== "number" || !Number.isFinite(nutrient))) {
      throw ApiError.badRequest(`${key} number veya null olmalıdır.`);
    }
    result[key] = nutrient as number | null;
  }
  return result as NutrientValues;
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

  personalize: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { barcode?: unknown; grams?: unknown } | undefined;
    if (typeof body?.barcode !== "string" || typeof body.grams !== "number") {
      throw ApiError.badRequest("barcode ve grams gereklidir.");
    }
    const personalization = await nutritionPersonalizationService.personalizeBarcode(
      requireUserId(req),
      body.barcode,
      body.grams,
    );
    sendSuccess(res, { personalization });
  }),

  personalizeNutrients: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { nutrients?: unknown } | undefined;
    const personalization = await nutritionPersonalizationService.personalizeNutrients(
      requireUserId(req),
      parseNutrients(body?.nutrients),
    );
    sendSuccess(res, { personalization });
  }),

  compare: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { barcode?: unknown; grams?: unknown; queries?: unknown } | undefined;
    if (typeof body?.barcode !== "string" || typeof body.grams !== "number") {
      throw ApiError.badRequest("barcode ve grams gereklidir.");
    }
    const queries = Array.isArray(body.queries)
      ? body.queries.filter((value): value is string => typeof value === "string").slice(0, 8)
      : undefined;
    const comparison = await nutritionPersonalizationService.compareBarcode(
      requireUserId(req),
      body.barcode,
      body.grams,
      queries,
    );
    sendSuccess(res, { comparison });
  }),
};
