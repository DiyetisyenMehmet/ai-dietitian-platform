import { normalizeBarcode } from "./barcode";
import type { CanonicalFood, ProductLifecycle, ProductLifecycleEvidence } from "./nutrition-data.types";

function validIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function unknownLifecycle(): ProductLifecycle {
  return { status: "UNKNOWN", replacedBy: null, source: null };
}

/**
 * Lifecycle is evidence-only. Cache age, provider misses, package-size changes
 * and sibling variants never imply that a real product was discontinued.
 */
export function buildProductLifecycle(food: CanonicalFood): ProductLifecycle {
  const evidence = food.provenance.lifecycleEvidence;
  if (!evidence?.sourceReference?.trim()) return unknownLifecycle();

  let replacedBy: ProductLifecycle["replacedBy"] = null;
  if (evidence.status === "REPLACED") {
    const replacementBarcode = evidence.replacedByBarcode
      ? normalizeBarcode(evidence.replacedByBarcode)
      : null;
    const currentBarcode = food.barcode ? normalizeBarcode(food.barcode) : null;
    if (!replacementBarcode || replacementBarcode === currentBarcode) return unknownLifecycle();
    replacedBy = {
      barcode: replacementBarcode,
      variantKey: food.productCatalog?.family?.key
        ? `${food.productCatalog.family.key}::gtin:${replacementBarcode}`
        : null,
    };
  }

  return {
    status: evidence.status,
    replacedBy,
    source: {
      provider: food.provider,
      reference: evidence.sourceReference.trim(),
      observedAt: validIso(food.provenance.retrievedAt) ?? new Date(0).toISOString(),
      effectiveAt: validIso(evidence.effectiveAt),
    },
  };
}

export function withProductLifecycle(food: CanonicalFood): CanonicalFood {
  if (food.productLifecycle) return food;
  return { ...food, productLifecycle: buildProductLifecycle(food) };
}

export function withExplicitProductLifecycleEvidence(
  food: CanonicalFood,
  evidence: ProductLifecycleEvidence,
): CanonicalFood {
  return withProductLifecycle({
    ...food,
    provenance: { ...food.provenance, lifecycleEvidence: evidence },
  });
}
