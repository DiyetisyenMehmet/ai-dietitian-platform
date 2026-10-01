import type { CanonicalFood, NutrientValues } from "./nutrition-data.types";

export interface UserConfirmedFoodSubmission {
  userId: string;
  food: CanonicalFood;
}

function quantize(value: number | null, step: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value / step) * step;
}

function coreComplete(nutrients: NutrientValues): boolean {
  return nutrients.energyKcal !== null
    && nutrients.proteinG !== null
    && nutrients.carbohydratesG !== null
    && nutrients.fatG !== null;
}

function nutritionFingerprint(food: CanonicalFood): string | null {
  if (
    food.provider !== "DIEWISH" ||
    food.provenance.sourceReference !== "USER_CONFIRMED_PACKAGE_LABEL" ||
    !food.barcode ||
    !coreComplete(food.nutrientsPer100g)
  ) {
    return null;
  }

  const n = food.nutrientsPer100g;
  return JSON.stringify([
    food.barcode,
    quantize(n.energyKcal, 2),
    quantize(n.proteinG, 0.2),
    quantize(n.carbohydratesG, 0.2),
    quantize(n.fatG, 0.2),
    quantize(n.saturatedFatG, 0.2),
    quantize(n.sugarsG, 0.2),
    quantize(n.fiberG, 0.2),
    quantize(n.sodiumMg, 5),
    quantize(n.saltG, 0.02),
  ]);
}

/**
 * Promotes package-label facts only after independent users agree on the same
 * barcode and essentially the same per-100g nutrition panel.
 *
 * No image bytes or user identifiers are copied into the promoted food record.
 */
export function buildPackageLabelConsensus(
  submissions: readonly UserConfirmedFoodSubmission[],
  minimumDistinctUsers = 3,
): CanonicalFood | null {
  if (minimumDistinctUsers < 2) minimumDistinctUsers = 2;

  const groups = new Map<string, {
    food: CanonicalFood;
    users: Set<string>;
  }>();

  for (const submission of submissions) {
    const userId = submission.userId.trim();
    if (!userId) continue;
    const fingerprint = nutritionFingerprint(submission.food);
    if (!fingerprint) continue;
    const current = groups.get(fingerprint);
    if (current) {
      current.users.add(userId);
    } else {
      groups.set(fingerprint, {
        food: submission.food,
        users: new Set([userId]),
      });
    }
  }

  const winner = [...groups.values()]
    .filter((group) => group.users.size >= minimumDistinctUsers)
    .sort((a, b) => b.users.size - a.users.size)[0];

  if (!winner?.food.barcode) return null;

  const now = new Date().toISOString();
  return {
    ...winner.food,
    externalId: `package-consensus:${winner.food.barcode}`,
    provider: "DIEWISH",
    labels: [
      ...winner.food.labels.filter((label) => label !== "user-confirmed-package-label"),
      "diewish-package-label-consensus",
    ],
    provenance: {
      ...winner.food.provenance,
      provider: "DIEWISH",
      externalId: `package-consensus:${winner.food.barcode}`,
      retrievedAt: now,
      lastValidatedAt: now,
      sourceReference: "DIEWISH_PACKAGE_LABEL_CONSENSUS",
      stale: false,
    },
  };
}
