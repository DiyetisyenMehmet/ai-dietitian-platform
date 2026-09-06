import type { ExpertProduct } from "./expert-product.types";
import { SUPPLEMENT_RECOMMENDATION_MODE } from "./expert-product.types";

export { SUPPLEMENT_RECOMMENDATION_MODE };

/** Only server-curated HTTPS links may ever be exposed as product destinations. */
export function isSafeExpertProductUrl(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Publishing is intentionally stricter than merely existing in the catalog.
 * Draft/unreviewed/rejected products stay invisible to users. A product whose
 * regulatory status is still pending/rejected is also never published.
 */
export function isExpertProductPublishable(product: ExpertProduct): boolean {
  if (product.lifecycle !== "ACTIVE") return false;
  if (product.expertReviewStatus !== "APPROVED") return false;
  if (product.regulatoryStatus === "PENDING" || product.regulatoryStatus === "REJECTED") {
    return false;
  }

  return [product.purchaseUrl, product.imageUrl, product.regulatoryUrl].every(isSafeExpertProductUrl);
}

/**
 * AI recommendation permission is separate from catalog visibility. This keeps
 * the product data model ready while production remains FOOD_ONLY.
 */
export function canAiRecommendExpertProducts(): boolean {
  return SUPPLEMENT_RECOMMENDATION_MODE === "EXPERT_REVIEWED";
}
