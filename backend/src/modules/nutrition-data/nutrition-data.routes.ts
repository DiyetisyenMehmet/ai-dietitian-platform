import { Router } from "express";
import rateLimit from "express-rate-limit";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { sendError } from "../../utils/api-response";
import { nutritionDataController } from "./nutrition-data.controller";
import { uploadPackageLabel } from "./package-label.upload";

export const nutritionDataRouter = Router();
const labelLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => sendError(res, 429, "PACKAGE_LABEL_RATE_LIMIT", "Çok fazla etiket analizi denendi. Lütfen biraz sonra tekrar deneyin."),
});

nutritionDataRouter.use(authenticate, requireConsent);
nutritionDataRouter.get("/search", nutritionDataController.search);
nutritionDataRouter.get("/history", nutritionDataController.history);
nutritionDataRouter.get("/favorites", nutritionDataController.favorites);
nutritionDataRouter.get("/barcode/:barcode", nutritionDataController.barcode);
nutritionDataRouter.post("/barcode/:barcode/label-extract", labelLimiter, uploadPackageLabel(), nutritionDataController.extractPackageLabel);
nutritionDataRouter.post("/barcode/:barcode/confirm-label", nutritionDataController.confirmPackageLabel);
nutritionDataRouter.post("/barcode/:barcode/favorite", nutritionDataController.setFavorite);
nutritionDataRouter.post("/personalize", nutritionDataController.personalize);
nutritionDataRouter.post("/personalize-nutrients", nutritionDataController.personalizeNutrients);
nutritionDataRouter.post("/compare", nutritionDataController.compare);
