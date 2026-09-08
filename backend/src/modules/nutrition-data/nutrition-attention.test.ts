import assert from "node:assert/strict";
import test from "node:test";

import { derivePer100gAttentionFlags, derivePortionAttentionFlags } from "./nutrition-attention";
import type { NutrientValues } from "./nutrition-data.types";

function nutrients(overrides: Partial<NutrientValues> = {}): NutrientValues {
  return {
    energyKcal: null,
    proteinG: null,
    carbohydratesG: null,
    fatG: null,
    saturatedFatG: null,
    sugarsG: null,
    fiberG: null,
    sodiumMg: null,
    saltG: null,
    ...overrides,
  };
}

test("per-100g attention flags are deterministic and missing values stay unknown", () => {
  assert.deepEqual(derivePer100gAttentionFlags(nutrients()), []);
  const flags = derivePer100gAttentionFlags(
    nutrients({ energyKcal: 450, sugarsG: 23, saturatedFatG: 5.1, saltG: 1.6 }),
  );
  assert.deepEqual(flags.map((flag) => flag.code), [
    "HIGH_SUGARS",
    "HIGH_SATURATED_FAT",
    "HIGH_SALT",
    "HIGH_ENERGY_DENSITY",
  ]);
});

test("portion rules do not reuse per-100g thresholds", () => {
  const flags = derivePortionAttentionFlags(nutrients({ sodiumMg: 650, sugarsG: 26 }));
  assert.deepEqual(flags.map((flag) => flag.code), ["PORTION_HIGH_SODIUM", "PORTION_HIGH_SUGARS"]);
});

test("threshold boundaries are stable", () => {
  assert.deepEqual(
    derivePer100gAttentionFlags(nutrients({ sugarsG: 22.5, saturatedFatG: 5, saltG: 1.5, energyKcal: 399.9 })),
    [],
  );
});
