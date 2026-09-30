import assert from "node:assert/strict";
import { test } from "node:test";

import { NutritionDataService, type NutritionServiceProviders } from "./nutrition-data.service";
import type { NutritionDataRepository } from "./nutrition-data.repository";
import type { CanonicalFood } from "./nutrition-data.types";

function food(
  provider: CanonicalFood["provider"],
  barcode = "4006381333931",
): CanonicalFood {
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
      confidence: provider === "USDA" ? 0.95 : provider === "CNF" ? 0.92 : 0.75,
      ...(provider === "DIEWISH"
        ? { sourceReference: "USER_CONFIRMED_PACKAGE_LABEL" }
        : {}),
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

test("user-confirmed package label is used only after global providers miss", async () => {
  let userFallbackCalls = 0;
  const persistence = {
    async getFreshBarcode() { return null; },
    async getStaleBarcode() { return null; },
    async getUserConfirmedBarcode(userId: string) {
      userFallbackCalls += 1;
      return userId === "user-1" ? food("DIEWISH") : null;
    },
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService(providers({ off: null, usda: null }), persistence);
  const result = await service.getByBarcode("4006381333931", "user-1");
  assert.equal(result?.provider, "DIEWISH");
  assert.equal(userFallbackCalls, 1);
});

test("global provider result overrides a user-confirmed package label", async () => {
  let userFallbackCalls = 0;
  const persistence = {
    async getFreshBarcode() { return null; },
    async getStaleBarcode() { return null; },
    async getUserConfirmedBarcode() {
      userFallbackCalls += 1;
      return food("DIEWISH");
    },
    async upsertFood() {},
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService(
    providers({ off: food("OPEN_FOOD_FACTS") }),
    persistence,
  );
  const result = await service.getByBarcode("4006381333931", "user-1");
  assert.equal(result?.provider, "OPEN_FOOD_FACTS");
  assert.equal(userFallbackCalls, 0);
});

test("negative global barcode cache can still resolve a user-scoped confirmed label", async () => {
  let offCalls = 0;
  const persistence = {
    async getFreshBarcode() { return null; },
    async getStaleBarcode() { return null; },
    async getUserConfirmedBarcode(userId: string) {
      return userId === "user-1" ? food("DIEWISH") : null;
    },
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService(
    providers({
      off: null,
      usda: null,
      usdaConfigured: false,
      onOffCall: () => (offCalls += 1),
    }),
    persistence,
  );
  assert.equal(await service.getByBarcode("4006381333931"), null);
  assert.equal((await service.getByBarcode("4006381333931", "user-1"))?.provider, "DIEWISH");
  assert.equal(offCalls, 1);
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


test("food-name search falls back to Open Food Facts when structured USDA search has no result", async () => {
  const usdaQueries: string[] = [];
  const offQueries: string[] = [];
  const offFood = {
    ...food("OPEN_FOOD_FACTS", ""),
    externalId: "OFF-churchkhela",
    name: "Walnut Churchkhela",
    displayNameTr: "Cevizli Sucuk",
  };
  const service = new NutritionDataService({
    usda: {
      isConfigured() { return true; },
      async search(query) {
        usdaQueries.push(query);
        return [];
      },
      async searchBrandedBarcode() { return null; },
    },
    openFoodFacts: {
      async search(query) {
        offQueries.push(query);
        return query === "walnut churchkhela" ? [offFood] : [];
      },
      async getByBarcode() { return null; },
    },
  });

  const results = await service.search("Cevizli sucuk", 10);
  assert.equal(results[0]?.externalId, "OFF-churchkhela");
  assert.equal(usdaQueries[0], "walnut churchkhela");
  assert.equal(offQueries[0], "walnut churchkhela");
});


test("general food search reserves room for CNF instead of letting USDA crowd out every candidate", async () => {
  const calls: string[] = [];
  const usdaFood = {
    ...food("USDA", ""),
    externalId: "USDA-walnut",
    name: "Walnuts, english",
    displayNameTr: "Ceviz",
  };
  const cnfFood = {
    ...food("CNF", ""),
    externalId: "CNF-101",
    name: "Walnuts, english, dried",
    displayNameTr: "Walnuts, english, dried",
  };
  const service = new NutritionDataService({
    usda: {
      isConfigured() { return true; },
      async search(query) {
        calls.push(`USDA:${query}`);
        return [usdaFood];
      },
      async searchBrandedBarcode() { return null; },
    },
    cnf: {
      async search(query) {
        calls.push(`CNF:${query}`);
        return [cnfFood];
      },
    },
    openFoodFacts: {
      async search() { return []; },
      async getByBarcode() { return null; },
    },
  });

  const results = await service.search("ceviz", 5);
  assert.ok(results.some((item) => item.provider === "USDA"));
  assert.ok(results.some((item) => item.provider === "CNF"));
  assert.ok(calls.some((call) => call.startsWith("CNF:")));
});


test("fresh Diewish nutrition cache is used before any external provider", async () => {
  let providerCalls = 0;
  const cached = {
    ...food("USDA", ""),
    externalId: "cached-walnut",
    name: "Walnuts",
    displayNameTr: "Ceviz",
  };
  const persistence = {
    async searchLocal() { return [cached]; },
    async searchLocalStale() { return []; },
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService({
    usda: {
      isConfigured() { return true; },
      async search() { providerCalls += 1; return []; },
      async searchBrandedBarcode() { return null; },
    },
    cnf: {
      async search() { providerCalls += 1; return []; },
    },
    openFoodFacts: {
      async search() { providerCalls += 1; return []; },
      async getByBarcode() { return null; },
    },
  }, persistence);

  const results = await service.search("ceviz", 5);
  assert.equal(results[0]?.externalId, "cached-walnut");
  assert.equal(providerCalls, 0);
});

test("expired verified Diewish cache keeps food search working when live sources have no usable result", async () => {
  const stale = {
    ...food("CNF", ""),
    externalId: "stale-walnut",
    name: "Walnuts",
    displayNameTr: "Ceviz",
    provenance: {
      ...food("CNF", "").provenance,
      stale: true,
    },
  };
  const persistence = {
    async searchLocal() { return []; },
    async searchLocalStale() { return [stale]; },
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService({
    usda: {
      isConfigured() { return false; },
      async search() { return []; },
      async searchBrandedBarcode() { return null; },
    },
    cnf: {
      async search() { return []; },
    },
    openFoodFacts: {
      async search() { return []; },
      async getByBarcode() { return null; },
    },
  }, persistence);

  const results = await service.search("ceviz", 5);
  assert.equal(results[0]?.externalId, "stale-walnut");
  assert.equal(results[0]?.provenance.stale, true);
});

test("provider discovery stores only relevant food knowledge and remembers the original Turkish query", async () => {
  const saved: CanonicalFood[] = [];
  const aliases: Array<{ query: string; externalId: string; confidence: number }> = [];
  const walnut = {
    ...food("USDA", ""),
    externalId: "USDA-walnut",
    name: "Walnuts",
    displayNameTr: "Ceviz",
  };
  const irrelevant = {
    ...food("USDA", ""),
    externalId: "USDA-salmon",
    name: "Salmon, cooked",
    displayNameTr: "Somon",
  };
  const persistence = {
    async searchLocal() { return []; },
    async searchLocalStale() { return []; },
    async upsertFood(value: CanonicalFood) { saved.push(value); },
    async rememberSearchAlias(query: string, value: CanonicalFood, confidence: number) {
      aliases.push({ query, externalId: value.externalId, confidence });
    },
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService({
    usda: {
      isConfigured() { return true; },
      async search() { return [walnut, irrelevant]; },
      async searchBrandedBarcode() { return null; },
    },
    openFoodFacts: {
      async search() { return []; },
      async getByBarcode() { return null; },
    },
  }, persistence);

  await service.search("ceviz", 5);
  assert.deepEqual(saved.map((item) => item.externalId), ["USDA-walnut"]);
  assert.equal(aliases.length, 1);
  assert.equal(aliases[0]?.query, "ceviz");
  assert.equal(aliases[0]?.externalId, "USDA-walnut");
  assert.ok((aliases[0]?.confidence ?? 0) >= 0.7);
});


test("third-party package-label consensus is promoted into the shared Diewish nutrition cache", async () => {
  const barcode = "4006381333931";
  const submitted = food("DIEWISH", barcode);
  const consensus: CanonicalFood = {
    ...submitted,
    externalId: `package-consensus:${barcode}`,
    provenance: {
      ...submitted.provenance,
      externalId: `package-consensus:${barcode}`,
      sourceReference: "DIEWISH_PACKAGE_LABEL_CONSENSUS",
      confidence: 0.93,
    },
  };
  const events: string[] = [];
  const persisted: CanonicalFood[] = [];
  const persistence = {
    async recordBarcodeScan() {
      events.push("record");
    },
    async getUserConfirmedBarcodeConsensus() {
      events.push("consensus");
      return consensus;
    },
    async upsertFood(value: CanonicalFood) {
      events.push("upsert");
      persisted.push(value);
    },
  } as unknown as NutritionDataRepository;

  const service = new NutritionDataService(providers({ off: null, usda: null }), persistence);
  await service.saveUserConfirmedBarcode("user-3", barcode, submitted);

  assert.deepEqual(events, ["record", "consensus", "upsert"]);
  assert.equal(persisted[0]?.externalId, `package-consensus:${barcode}`);
  assert.equal(persisted[0]?.provenance.sourceReference, "DIEWISH_PACKAGE_LABEL_CONSENSUS");
});


test("Diewish local cache searches deterministic provider aliases before external sources", async () => {
  const calls: string[] = [];
  const cached = {
    ...food("COFID", ""),
    externalId: "cofid-walnut",
    name: "Walnuts, dried",
    displayNameTr: "Walnuts, dried",
  };
  const persistence = {
    async searchLocal(query: string) {
      calls.push(`fresh:${query}`);
      return query === "walnuts" ? [cached] : [];
    },
    async searchLocalStale(query: string) {
      calls.push(`stale:${query}`);
      return [];
    },
  } as unknown as NutritionDataRepository;
  let providerCalls = 0;
  const service = new NutritionDataService({
    usda: {
      isConfigured() { return true; },
      async search() { providerCalls += 1; return []; },
      async searchBrandedBarcode() { return null; },
    },
    openFoodFacts: {
      async search() { providerCalls += 1; return []; },
      async getByBarcode() { return null; },
    },
  }, persistence);

  const result = await service.search("ceviz", 5);
  assert.equal(result[0]?.provider, "COFID");
  assert.equal(result[0]?.externalId, "cofid-walnut");
  assert.equal(providerCalls, 0);
  assert.ok(calls.includes("fresh:walnuts"));
});


test("catalog type-ahead searches only Diewish stored barcode products", async () => {
  let providerCalls = 0;
  const catalogFood: CanonicalFood = {
    ...food("OPEN_FOOD_FACTS", "8690000000001"),
    externalId: "tomurcuk-125",
    name: "Tomurcuk",
    displayNameTr: "Tomurcuk",
    brand: "Çaykur",
    quantity: "125 g",
  };
  const persistence = {
    async searchCatalogProducts(query: string, limit: number) {
      assert.equal(query, "Tomurcuk");
      assert.equal(limit, 20);
      return [catalogFood];
    },
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService({
    usda: {
      isConfigured() { return true; },
      async search() { providerCalls += 1; return []; },
      async searchBrandedBarcode() { providerCalls += 1; return null; },
    },
    openFoodFacts: {
      async search() { providerCalls += 1; return []; },
      async getByBarcode() { providerCalls += 1; return null; },
    },
  }, persistence);

  const results = await service.searchCatalog("Tomurcuk", 20);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.brand, "Çaykur");
  assert.equal(results[0]?.quantity, "125 g");
  assert.equal(providerCalls, 0);
});

test("catalog type-ahead rejects one-character queries", async () => {
  const service = new NutritionDataService(providers());
  await assert.rejects(() => service.searchCatalog("T"), /2-120/);
});


test("legacy fresh Diewish cache stores derived usage without refreshing external providers", async () => {
  let metadataUpdates = 0;
  let providerCalls = 0;
  const cachedTea: CanonicalFood = {
    ...food("OPEN_FOOD_FACTS"),
    name: "Black Tea",
    displayNameTr: "Siyah Çay",
    brand: "Test",
    quantity: "125 g",
    provenance: {
      ...food("OPEN_FOOD_FACTS").provenance,
      sourceCategories: ["black teas"],
    },
  };
  const persistence = {
    async getFreshBarcode() { return cachedTea; },
    async getStaleBarcode() { return null; },
    async updateProductMetadata(value: CanonicalFood) {
      metadataUpdates += 1;
      assert.equal(value.productUsage?.type, "BREWING");
      assert.equal(value.productCatalog?.category?.name, "İçecek");
      assert.equal(value.productCatalog?.subcategory?.name, "Çay");
    },
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService(
    providers({
      off: null,
      usda: null,
      onOffCall: () => (providerCalls += 1),
      onUsdaCall: () => (providerCalls += 1),
    }),
    persistence,
  );

  const result = await service.getByBarcode("4006381333931");
  assert.equal(result?.productUsage?.type, "BREWING");
  assert.equal(metadataUpdates, 1);
  assert.equal(providerCalls, 0);
});

test("accepted barcode product persists product usage intelligence with the existing Diewish food record", async () => {
  let stored: CanonicalFood | null = null;
  let usdaCalls = 0;
  const tea: CanonicalFood = {
    ...food("OPEN_FOOD_FACTS"),
    name: "Tomurcuk Black Tea",
    displayNameTr: "Çaykur Tomurcuk",
    brand: "Çaykur",
    quantity: "125 g",
    ingredients: ["black tea"],
    provenance: {
      ...food("OPEN_FOOD_FACTS").provenance,
      sourceCategories: ["black teas", "teas"],
    },
  };
  const persistence = {
    async getFreshBarcode() { return null; },
    async getStaleBarcode() { return null; },
    async upsertFood(value: CanonicalFood) { stored = value; },
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService(
    providers({
      off: tea,
      usda: food("USDA"),
      onUsdaCall: () => (usdaCalls += 1),
    }),
    persistence,
  );

  const result = await service.getByBarcode("4006381333931");
  assert.equal(result?.productUsage?.type, "BREWING");
  assert.equal(result?.quantity, "125 g");
  assert.equal(result?.serving, null);
  assert.equal("consumedAmount" in (result ?? {}), false);
  assert.equal(stored?.productUsage?.type, "BREWING");
  assert.equal(stored?.productCatalog?.family?.name, "Tomurcuk");
  assert.equal(stored?.productCatalog?.variant?.barcode, "4006381333931");
  assert.equal(usdaCalls, 0);
});

test("weak fresh Diewish cache is cross-checked instead of being returned as final data", async () => {
  let usdaCalls = 0;
  const weakCached: CanonicalFood = {
    ...food("OPEN_FOOD_FACTS"),
    name: "Product",
    displayNameTr: "Ürün",
    nutrientsPer100g: {
      energyKcal: null,
      proteinG: null,
      carbohydratesG: null,
      fatG: null,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
  };
  const persistence = {
    async getFreshBarcode() { return weakCached; },
    async getStaleBarcode() { return null; },
    async upsertFood() {},
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService(
    providers({
      off: null,
      usda: food("USDA"),
      onUsdaCall: () => (usdaCalls += 1),
    }),
    persistence,
  );

  const result = await service.getByBarcode("4006381333931");
  assert.equal(result?.provider, "USDA");
  assert.equal(usdaCalls, 1);
});

test("partial barcode result can be returned but is not persisted as definitive shared data", async () => {
  let writes = 0;
  const partial: CanonicalFood = {
    ...food("OPEN_FOOD_FACTS"),
    brand: null,
    quantity: null,
    serving: null,
    nutrientsPer100g: {
      energyKcal: 120,
      proteinG: null,
      carbohydratesG: null,
      fatG: null,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
  };
  const persistence = {
    async getFreshBarcode() { return null; },
    async getStaleBarcode() { return null; },
    async upsertFood() { writes += 1; },
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService(
    providers({ off: partial, usda: null, usdaConfigured: false }),
    persistence,
  );

  const result = await service.getByBarcode("4006381333931");
  assert.equal(result?.provider, "OPEN_FOOD_FACTS");
  assert.equal(writes, 0);
});

test("suspicious Open Food Facts barcode data is cross-checked and stronger USDA data wins", async () => {
  let usdaCalls = 0;
  const weakOff: CanonicalFood = {
    ...food("OPEN_FOOD_FACTS"),
    name: "Product",
    displayNameTr: "Ürün",
    nutrientsPer100g: {
      energyKcal: null,
      proteinG: null,
      carbohydratesG: null,
      fatG: null,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
  };
  const service = new NutritionDataService(
    providers({
      off: weakOff,
      usda: food("USDA"),
      onUsdaCall: () => (usdaCalls += 1),
    }),
  );

  const result = await service.getByBarcode("4006381333931");
  assert.equal(result?.provider, "USDA");
  assert.equal(usdaCalls, 1);
});

test("barcode quality gate rejects a provider candidate whose barcode does not match the scanned GTIN", async () => {
  const mismatched = food("OPEN_FOOD_FACTS", "5901234123457");
  const service = new NutritionDataService(
    providers({
      off: mismatched,
      usda: null,
      usdaConfigured: false,
    }),
  );

  assert.equal(await service.getByBarcode("4006381333931"), null);
});

test("salt product with legitimate zero macros remains a strong barcode result", async () => {
  let usdaCalls = 0;
  const salt: CanonicalFood = {
    ...food("OPEN_FOOD_FACTS"),
    name: "Rock Salt",
    displayNameTr: "Kaya Tuzu",
    brand: "Kristal",
    quantity: "500 g",
    nutrientsPer100g: {
      energyKcal: 0,
      proteinG: 0,
      carbohydratesG: 0,
      fatG: 0,
      saturatedFatG: 0,
      sugarsG: 0,
      fiberG: 0,
      sodiumMg: 40_000,
      saltG: 100,
    },
  };
  const service = new NutritionDataService(
    providers({
      off: salt,
      usda: food("USDA"),
      onUsdaCall: () => (usdaCalls += 1),
    }),
  );

  const result = await service.getByBarcode("4006381333931");
  assert.equal(result?.provider, "OPEN_FOOD_FACTS");
  assert.equal(result?.displayNameTr, "Kaya Tuzu");
  assert.equal(usdaCalls, 0);
});

test("logically inconsistent Open Food Facts nutrients trigger a USDA cross-check", async () => {
  let usdaCalls = 0;
  const inconsistent: CanonicalFood = {
    ...food("OPEN_FOOD_FACTS"),
    brand: "Test",
    nutrientsPer100g: {
      ...food("OPEN_FOOD_FACTS").nutrientsPer100g,
      carbohydratesG: 10,
      sugarsG: 40,
    },
  };
  const service = new NutritionDataService(
    providers({
      off: inconsistent,
      usda: food("USDA"),
      onUsdaCall: () => (usdaCalls += 1),
    }),
  );

  const result = await service.getByBarcode("4006381333931");
  assert.equal(result?.provider, "USDA");
  assert.equal(usdaCalls, 1);
});


test("scan history is served from Diewish persistence without querying barcode providers or creating another scan", async () => {
  let providerCalls = 0;
  let newScanWrites = 0;
  const snapshot = food("OPEN_FOOD_FACTS");
  snapshot.quantity = "125 g";
  snapshot.displayNameTr = "Snapshot ürün";

  const persistence = {
    async listScanHistory(userId: string, limit: number) {
      assert.equal(userId, "user-1");
      assert.equal(limit, 100);
      return [{
        id: "barcode:event-1",
        scanType: "BARCODE" as const,
        title: snapshot.displayNameTr,
        brand: snapshot.brand,
        barcode: snapshot.barcode,
        imageUrl: snapshot.imageUrl,
        grams: null,
        calories: null,
        food: snapshot,
        photo: null,
        scannedAt: "2026-09-30T12:00:00.000Z",
      }];
    },
    async recordBarcodeScan() {
      newScanWrites += 1;
    },
  } as unknown as NutritionDataRepository;

  const service = new NutritionDataService(
    providers({
      onOffCall: () => (providerCalls += 1),
      onUsdaCall: () => (providerCalls += 1),
    }),
    persistence,
  );

  const history = await service.listScanHistory("user-1", 500);
  assert.equal(history.length, 1);
  assert.equal(history[0]?.food?.quantity, "125 g");
  assert.equal(history[0]?.grams, null);
  assert.equal(history[0]?.calories, null);
  assert.equal(providerCalls, 0);
  assert.equal(newScanWrites, 0);
});


test("marking history viewed updates view metadata only and never creates a scan or queries providers", async () => {
  let providerCalls = 0;
  let scanWrites = 0;
  const viewCalls: Array<{ userId: string; scanType: string; eventId: bigint; viewedAt: Date }> = [];

  const persistence = {
    async markScanHistoryViewed(
      userId: string,
      scanType: "BARCODE" | "PHOTO",
      eventId: bigint,
      viewedAt: Date,
    ) {
      viewCalls.push({ userId, scanType, eventId, viewedAt });
      return true;
    },
    async recordBarcodeScan() {
      scanWrites += 1;
    },
  } as unknown as NutritionDataRepository;

  const service = new NutritionDataService(
    providers({
      onOffCall: () => (providerCalls += 1),
      onUsdaCall: () => (providerCalls += 1),
    }),
    persistence,
  );

  const firstViewedAt = await service.markScanHistoryViewed("user-1", "barcode:42");
  const secondViewedAt = await service.markScanHistoryViewed("user-1", "barcode:42");
  await service.markScanHistoryViewed("user-1", "photo:7");

  assert.equal(viewCalls.length, 3);
  assert.equal(viewCalls[0]?.scanType, "BARCODE");
  assert.equal(viewCalls[0]?.eventId, 42n);
  assert.equal(viewCalls[2]?.scanType, "PHOTO");
  assert.equal(viewCalls[2]?.eventId, 7n);
  assert.ok(Date.parse(firstViewedAt) > 0);
  assert.ok(Date.parse(secondViewedAt) > 0);
  assert.equal(scanWrites, 0);
  assert.equal(providerCalls, 0);
});

test("marking history viewed rejects malformed ids without touching persistence", async () => {
  let viewCalls = 0;
  const persistence = {
    async markScanHistoryViewed() {
      viewCalls += 1;
      return true;
    },
  } as unknown as NutritionDataRepository;
  const service = new NutritionDataService(providers(), persistence);

  await assert.rejects(
    () => service.markScanHistoryViewed("user-1", "barcode:not-a-number"),
    /Geçersiz tarama geçmişi kaydı/,
  );
  assert.equal(viewCalls, 0);
});
