import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { nutritionDataController } from "./nutrition-data.controller";

export const nutritionDataRouter = Router();

nutritionDataRouter.use(authenticate, requireConsent);
nutritionDataRouter.get("/search", nutritionDataController.search);
nutritionDataRouter.get("/history", nutritionDataController.history);
nutritionDataRouter.get("/favorites", nutritionDataController.favorites);
nutritionDataRouter.get("/barcode/:barcode", nutritionDataController.barcode);
nutritionDataRouter.post("/barcode/:barcode/favorite", nutritionDataController.setFavorite);
nutritionDataRouter.post("/personalize", nutritionDataController.personalize);
nutritionDataRouter.post("/personalize-nutrients", nutritionDataController.personalizeNutrients);
nutritionDataRouter.post("/compare", nutritionDataController.compare);
