import assert from "node:assert/strict";
import { test } from "node:test";

import { NutritionDataService, type NutritionServiceProviders } from "./nutrition-data.service";
import type { NutritionDataRepository } from "./nutrition-data.repository";
import type { CanonicalFood } from "./nutrition-data.types";

function food(provider: "USDA" | "OPEN_FOOD_FACTS", barcode = "4006381333931"): CanonicalFood {
  return {
    externalId: `${provider}-1`,
    provider,
    name: "Test food",
    displayNameTr: "Test besin",
    brand: null,
    barcode,
    imageUrl: null,
    quantity: null,
    serving: null,
    nutrientsPer100g: {
      energyKcal: 100,
      proteinG: 10,
      carbohydratesG: 10,
      fatG: 2,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
    ingredients: [],
    allergens: [],
    additives: [],
    labels: [],
    vegan: null,
    vegetarian: null,
    glutenFree: null,
    nutriScore: null,
    novaGroup: null,
    provenance: {
      provider,
      externalId: `${provider}-1`,
      retrievedAt: new Date(0).toISOString(),
      dataBasis: "PER_100_G",
      confidence: provider === "USDA" ? 0.95 : 0.75,
    },
  };
}

function providers(overrides?: {
  off?: CanonicalFood | null;
  usda?: CanonicalFood | null;
  usdaConfigured?: boolean;
  offError?: boolean;
  usdaError?: boolean;
  onOffCall?: () => void;
  onUsdaCall?: () => void;
}): NutritionServiceProviders {
  return {
    openFoodFacts: {
      async getByBarcode() {
        overrides?.onOffCall?.();
        if (overrides?.offError) throw new Error("OFF_DOWN");
        return overrides?.off ?? null;
      },
    },
    usda: {
      isConfigured() {
        return overrides?.usdaConfigured ?? true;
      },
      async search() {
        return [];
      },
      async searchBrandedBarcode() {
        overrides?.onUsdaCall?.();
        if (overrides?.usdaError) throw new Error("USDA_DOWN");
        return overrides?.usda ?? null;
      },
    },
  };
}

test("barcode lookup prefers Open Food Facts and skips USDA when OFF has the product", async () => {
  let usdaCalls = 0;
  const service = new NutritionDataService(
    providers({
      off: food("OPEN_FOOD_FACTS"),
      usda: food("USDA"),
      onUsdaCall: () => (usdaCalls += 1),
    }),
  );
  const result = await service.getByBarcode("4006381333931");
  assert.equal(result?.provider, "OPEN_FOOD_FACTS");
  assert.equal(usdaCalls, 0);
});

test("barcode lookup falls back to USDA Branded when OFF has no product", async () => {
  const service = new NutritionDataService(providers({ off: null, usda: food("USDA") }));
  const result = await service.getByBarcode("4006381333931");
  assert.equal(result?.provider, "USDA");
});

test("negative barcode result is cached briefly and does not repeat provider calls", async () => {
  let offCalls = 0;
  const service = new NutritionDataService(
    providers({
      off: null,
      usda: null,
      usdaConfigured: false,
      onOffCall: () => (offCalls += 1),
    }),
  );
  assert.equal(await service.getByBarcode("4006381333931"), null);
  assert.equal(await service.getByBarcode("4006381333931"), null);
  assert.equal(offCalls, 1);
});

test("malformed barcode is rejected before provider calls", async () => {
  let offCalls = 0;
  const service = new NutritionDataService(providers({ onOffCall: () => (offCalls += 1) }));
  await assert.rejects(service.getByBarcode("not-a-barcode"));
  assert.equal(offCalls, 0);
});

test("expired cache is served only when live provider refresh fails", async () => {
  const stale = {
    ...food("OPEN_FOOD_FACTS"),
    provenance: { ...food("OPEN_FOOD_FACTS").provenance, stale: true },
  };
  const persistence = {
    async getFreshBarcode() { return null; },
    async getStaleBarcode() { return stale; },
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService(
    providers({ offError: true, usdaConfigured: false }),
    persistence,
  );
  const result = await service.getByBarcode("4006381333931");
  assert.equal(result?.provenance.stale, true);
});

test("expired cache is not used when providers positively report a miss", async () => {
  const persistence = {
    async getFreshBarcode() { return null; },
    async getStaleBarcode() { return food("OPEN_FOOD_FACTS"); },
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService(
    providers({ off: null, usda: null, usdaConfigured: false }),
    persistence,
  );
  assert.equal(await service.getByBarcode("4006381333931"), null);
});

test("Turkish ingredient search uses deterministic English alias before USDA fallback", async () => {
  const queries: string[] = [];
  const resultFood = { ...food("USDA", ""), externalId: "USDA-chicken", displayNameTr: "Tavuk göğsü" };
  const service = new NutritionDataService({
    openFoodFacts: { async getByBarcode() { return null; } },
    usda: {
      isConfigured() { return true; },
      async search(query) {
        queries.push(query);
        return query === "cooked chicken breast" ? [resultFood] : [];
      },
      async searchBrandedBarcode() { return null; },
    },
  });

  const results = await service.search("Pişmiş tavuk göğsü", 5);
  assert.equal(results[0]?.externalId, "USDA-chicken");
  assert.equal(queries[0], "cooked chicken breast");
  assert.equal(queries.includes("Pişmiş tavuk göğsü"), true);
});
