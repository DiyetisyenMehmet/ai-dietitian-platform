import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/api-response";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import { findPublishedExpertProduct, listPublishedExpertProducts } from "./expert-product.catalog";
import { canAiRecommendExpertProducts, SUPPLEMENT_RECOMMENDATION_MODE } from "./expert-product.policy";

export const expertProductController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, {
      recommendationMode: SUPPLEMENT_RECOMMENDATION_MODE,
      aiRecommendationEnabled: canAiRecommendExpertProducts(),
      products: listPublishedExpertProducts(),
    });
  }),

  getBySlug: asyncHandler(async (req: Request, res: Response) => {
    const product = findPublishedExpertProduct(req.params.slug);
    if (!product) throw ApiError.notFound("Expert-reviewed product not found.");

    sendSuccess(res, {
      recommendationMode: SUPPLEMENT_RECOMMENDATION_MODE,
      aiRecommendationEnabled: canAiRecommendExpertProducts(),
      product,
    });
  }),
};
