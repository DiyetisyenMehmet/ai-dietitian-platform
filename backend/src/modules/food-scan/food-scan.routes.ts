import { Router } from "express";
import rateLimit from "express-rate-limit";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { sendError } from "../../utils/api-response";
import { foodScanController } from "./food-scan.controller";
import { uploadFoodImage } from "./food-scan.upload";

export const foodScanRouter = Router();

/** Additional cost guard on top of the global API limiter. */
const foodScanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, "FOOD_SCAN_RATE_LIMIT", "Çok fazla görsel analizi denendi. Lütfen biraz sonra tekrar deneyin.");
  },
});

foodScanRouter.post(
  "/analyze",
  authenticate,
  requireConsent,
  foodScanLimiter,
  uploadFoodImage(),
  foodScanController.analyze,
);

/** User-confirmed food name path when visual identity is uncertain. */
foodScanRouter.post(
  "/analyze-by-name",
  authenticate,
  requireConsent,
  foodScanLimiter,
  foodScanController.analyzeByName,
);

/** Stateless deterministic recalculation after the user corrects recipe ingredients. */
foodScanRouter.post(
  "/recalculate",
  authenticate,
  requireConsent,
  foodScanController.recalculate,
);
