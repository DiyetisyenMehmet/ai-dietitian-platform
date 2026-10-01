import { assessBarcodeFoodQuality } from "./barcode-quality";
import type { CanonicalFood, ProductLifecycleStatus } from "./nutrition-data.types";

export interface ResolvedScanProductIdentity {
  displayNameTr: string;
  brand: string | null;
  variantKey: string;
  lifecycleStatus: ProductLifecycleStatus;
  replacedByBarcode: string | null;
}

/**
 * Resolve history identity only from an already-persisted Diewish catalog product.
 * This never mutates or substitutes the historical scan snapshot.
 */
export function resolveStoredScanProductIdentity(
  barcode: string | null,
  storedFood: CanonicalFood | null,
): ResolvedScanProductIdentity | null {
  if (!barcode || !storedFood || storedFood.barcode !== barcode) return null;

  const variant = storedFood.productCatalog?.variant;
  if (!variant?.key || variant.barcode !== barcode) return null;

  const quality = assessBarcodeFoodQuality(storedFood, barcode);
  if (quality.tier === "REJECT" || quality.tier === "WEAK") return null;

  const displayNameTr = (storedFood.displayNameTr || storedFood.name).trim();
  if (!displayNameTr) return null;

  return {
    displayNameTr,
    brand: storedFood.brand?.trim() || null,
    variantKey: variant.key,
    lifecycleStatus: storedFood.productLifecycle?.status ?? "UNKNOWN",
    replacedByBarcode: storedFood.productLifecycle?.replacedBy?.barcode ?? null,
  };
}
