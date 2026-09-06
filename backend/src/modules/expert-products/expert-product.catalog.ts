import { isExpertProductPublishable } from "./expert-product.policy";
import type { ExpertProduct } from "./expert-product.types";

/**
 * Curated product registry.
 *
 * Intentionally empty at launch. A future approved product (BZTL or any other
 * brand) can be added here with its ingredients, review/regulatory metadata and
 * optional purchase link without changing the API, AI contract or client
 * contract. When catalog administration grows, this registry can be replaced by
 * a database/CMS adapter behind the same functions.
 */
export const EXPERT_PRODUCT_CATALOG: readonly ExpertProduct[] = [];

export function listPublishedExpertProducts(): ExpertProduct[] {
  return EXPERT_PRODUCT_CATALOG.filter(isExpertProductPublishable);
}

export function findPublishedExpertProduct(slug: string): ExpertProduct | null {
  return listPublishedExpertProducts().find((product) => product.slug === slug) ?? null;
}
