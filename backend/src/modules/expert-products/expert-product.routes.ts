import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { expertProductController } from "./expert-product.controller";

/**
 * Read-only expert-product catalog. No user can create or modify products from
 * this surface. Product onboarding remains a server-side curated operation so
 * an AI/user cannot inject an unreviewed product or purchase link.
 */
export const expertProductRouter = Router();

expertProductRouter.get("/", authenticate, expertProductController.list);
expertProductRouter.get("/:slug", authenticate, expertProductController.getBySlug);
