export type SupplementRecommendationMode = "FOOD_ONLY" | "EXPERT_REVIEWED";

/**
 * Current production policy. Diewish may recommend ordinary foods and culinary
 * ingredients, but it must not autonomously select supplement products, doses,
 * schedules or purchase links. The EXPERT_REVIEWED mode is deliberately kept as
 * an explicit future capability so enabling it requires a conscious policy
 * change after clinical/legal review.
 */
export const SUPPLEMENT_RECOMMENDATION_MODE: SupplementRecommendationMode = "FOOD_ONLY";

export type ExpertProductCategory =
  | "HERBAL_BLEND"
  | "VITAMIN_MINERAL"
  | "SUPPLEMENT"
  | "FUNCTIONAL_FOOD"
  | "OTHER";

export type ExpertProductLifecycle = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type ExpertReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type RegulatoryVerificationStatus = "NOT_REQUIRED" | "PENDING" | "VERIFIED" | "REJECTED";

/**
 * Provider-agnostic product contract. It intentionally contains no user data.
 * Product and purchase URLs are optional so a clinically reviewed record can be
 * prepared before a sales channel exists, then linked later without changing
 * the API contract.
 */
export interface ExpertProduct {
  id: string;
  slug: string;
  name: string;
  brand?: string;
  category: ExpertProductCategory;
  shortDescription?: string;
  ingredients: string[];
  allergens?: string[];
  warnings?: string[];
  contraindications?: string[];
  interactionNotes?: string[];
  lifecycle: ExpertProductLifecycle;
  expertReviewStatus: ExpertReviewStatus;
  expertReviewedAt?: string;
  regulatoryStatus: RegulatoryVerificationStatus;
  regulatoryAuthority?: string;
  regulatoryReference?: string;
  regulatoryUrl?: string;
  purchaseUrl?: string;
  imageUrl?: string;
}
