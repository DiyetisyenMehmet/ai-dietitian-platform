import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { MICRONUTRIENT_KEYS, emptyMicronutrients } from "./micronutrients";
import { nutritionDataService } from "./nutrition-data.service";
import { nutritionPersonalizationService } from "./nutrition-personalization.service";
import { toBarcodeScanResult, toNutritionLabelScanResult } from "./nutrition-scan-result";
import { CORE_NUTRIENT_KEYS, type NutrientValues } from "./nutrition-data.types";
import { analyzePackageLabelImage } from "./package-label.provider";
import { buildUserConfirmedPackageLabelFood, normalizePackageLabelDraft } from "./package-label";

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
  const result = Object.fromEntries(CORE_NUTRIENT_KEYS.map((key) => [key, null])) as unknown as NutrientValues;
  for (const key of CORE_NUTRIENT_KEYS) {
    const nutrient = record[key];
    if (nutrient !== null && (typeof nutrient !== "number" || !Number.isFinite(nutrient) || nutrient < 0)) {
      throw ApiError.badRequest(`${key} geçerli bir number veya null olmalıdır.`);
    }
    result[key] = nutrient as number | null;
  }

  const rawMicronutrients = record.micronutrients;
  if (rawMicronutrients !== undefined && rawMicronutrients !== null) {
    if (typeof rawMicronutrients !== "object" || Array.isArray(rawMicronutrients)) {
      throw ApiError.badRequest("micronutrients geçerli bir nesne olmalıdır.");
    }
    const micronutrientRecord = rawMicronutrients as Record<string, unknown>;
    const micronutrients = emptyMicronutrients();
    let hasAny = false;
    for (const key of MICRONUTRIENT_KEYS) {
      const raw = micronutrientRecord[key];
      if (raw === undefined || raw === null) continue;
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1_000_000) {
        throw ApiError.badRequest(`micronutrients.${key} geçersiz.`);
      }
      micronutrients[key] = raw;
      hasAny = true;
    }
    if (hasAny) result.micronutrients = micronutrients;
  }
  return result;
}

export const nutritionDataController = {
  search: asyncHandler(async (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const foods = await nutritionDataService.search(query, parsedLimit(req, 10));
    sendSuccess(res, { foods, sourcePolicy: "DIEWISH_CACHE_THEN_USDA" });
  }),

  catalogSearch: asyncHandler(async (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const foods = await nutritionDataService.searchCatalog(query, parsedLimit(req, 20));
    sendSuccess(res, { foods, sourcePolicy: "DIEWISH_STORED_BARCODE_CATALOG_ONLY" });
  }),

  barcode: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const barcode = req.params.barcode ?? "";
    const food = await nutritionDataService.getByBarcode(barcode, userId);
    await nutritionDataService.recordBarcodeScan(userId, barcode, food);
    const userLabel = food?.provenance.sourceReference === "USER_CONFIRMED_PACKAGE_LABEL";
    sendSuccess(res, {
      found: food !== null,
      food,
      scan: food
        ? userLabel
          ? toNutritionLabelScanResult(food)
          : toBarcodeScanResult(food)
        : null,
      sourcePolicy: "DIEWISH_CACHE_THEN_OPEN_FOOD_FACTS_THEN_USDA_BRANDED_THEN_USER_CONFIRMED_LABEL",
    });
  }),

  extractPackageLabel: asyncHandler(async (req: Request, res: Response) => {
    requireUserId(req);
    if (!req.file?.buffer) {
      throw ApiError.badRequest('"file" alanında besin etiketi görseli yüklemelisin.');
    }
    const draft = await analyzePackageLabelImage(req.file.buffer);
    sendSuccess(res, { draft });
  }),

  confirmPackageLabel: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const draft = normalizePackageLabelDraft(req.body);
    const food = buildUserConfirmedPackageLabelFood(req.params.barcode ?? "", draft);
    await nutritionDataService.saveUserConfirmedBarcode(userId, req.params.barcode ?? "", food);
    sendSuccess(res, { food, scan: toNutritionLabelScanResult(food) }, 201);
  }),

  history: asyncHandler(async (req: Request, res: Response) => {
    const scans = await nutritionDataService.listRecentScans(requireUserId(req), parsedLimit(req, 20));
    sendSuccess(res, { scans });
  }),

  scanHistory: asyncHandler(async (req: Request, res: Response) => {
    const scans = await nutritionDataService.listScanHistory(requireUserId(req), parsedLimit(req, 50));
    sendSuccess(res, { scans });
  }),

  markScanHistoryViewed: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { historyId?: unknown } | undefined;
    if (typeof body?.historyId !== "string") {
      throw ApiError.badRequest("historyId gereklidir.");
    }
    const lastViewedAt = await nutritionDataService.markScanHistoryViewed(
      requireUserId(req),
      body.historyId,
    );
    sendSuccess(res, { historyId: body.historyId, lastViewedAt });
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
