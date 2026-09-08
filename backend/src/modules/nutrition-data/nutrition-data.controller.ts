import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { nutritionDataService } from "./nutrition-data.service";

export const nutritionDataController = {
  search: asyncHandler(async (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const parsedLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : 10;
    const foods = await nutritionDataService.search(query, parsedLimit);
    sendSuccess(res, { foods, sourcePolicy: "DIEWISH_CACHE_THEN_USDA" });
  }),

  barcode: asyncHandler(async (req: Request, res: Response) => {
    const food = await nutritionDataService.getByBarcode(req.params.barcode ?? "");
    sendSuccess(res, {
      found: food !== null,
      food,
      sourcePolicy: "DIEWISH_CACHE_THEN_OPEN_FOOD_FACTS_THEN_USDA_BRANDED",
    });
  }),
};
