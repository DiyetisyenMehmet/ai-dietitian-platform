import assert from "node:assert/strict";
import { test } from "node:test";

import { expandNutritionProviderQueries, normalizeTurkishSearch } from "./nutrition-query-aliases";

test("normalizes Turkish food names into provider-safe ASCII", () => {
  assert.equal(normalizeTurkishSearch("  Pişmiş Tavuk Göğsü  "), "pismis tavuk gogsu");
});

test("expands common Turkish ingredient names to English-first USDA queries", () => {
  assert.deepEqual(expandNutritionProviderQueries("Pişmiş tavuk göğsü"), [
    "cooked chicken breast",
    "Pişmiş tavuk göğsü",
  ]);
  assert.deepEqual(expandNutritionProviderQueries("zeytinyağı"), ["olive oil", "zeytinyağı"]);
  assert.deepEqual(expandNutritionProviderQueries("mercimek"), ["lentils", "mercimek"]);
});

test("keeps an English query unchanged and bounded", () => {
  assert.deepEqual(expandNutritionProviderQueries("chicken breast"), ["chicken breast"]);
});
