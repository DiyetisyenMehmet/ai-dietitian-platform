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

/**
 * POST /api/food-scan/analyze
 * The image is processed in memory and is not persisted by this module. Current
 * mandatory consent is checked before multipart parsing or provider work starts.
 */
foodScanRouter.post(
  "/analyze",
  authenticate,
  requireConsent,
  foodScanLimiter,
  uploadFoodImage(),
  foodScanController.analyze,
);
