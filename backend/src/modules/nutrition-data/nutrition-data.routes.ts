import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { nutritionDataController } from "./nutrition-data.controller";

export const nutritionDataRouter = Router();

nutritionDataRouter.get("/search", authenticate, requireConsent, nutritionDataController.search);
nutritionDataRouter.get("/barcode/:barcode", authenticate, requireConsent, nutritionDataController.barcode);
