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
  assert.deepEqual(expandNutritionProviderQueries("yeşil kabak"), ["zucchini", "yeşil kabak"]);
  assert.deepEqual(expandNutritionProviderQueries("soğan"), ["onion", "soğan"]);
  assert.deepEqual(expandNutritionProviderQueries("arpa şehriye"), ["orzo pasta cooked", "arpa şehriye"]);
  assert.deepEqual(expandNutritionProviderQueries("tuz"), ["salt", "tuz"]);
});

test("normalizes the observed tomato sauce/paste compound without leaking Turkish stop words", () => {
  assert.deepEqual(expandNutritionProviderQueries("domates sosu ve salça"), [
    "tomato sauce",
    "domates sosu ve salça",
  ]);
});

test("does not force an ambiguous standalone salça into one specific food", () => {
  assert.deepEqual(expandNutritionProviderQueries("salça"), ["salca", "salça"]);
});

test("keeps an English query unchanged and bounded", () => {
  assert.deepEqual(expandNutritionProviderQueries("chicken breast"), ["chicken breast"]);
});
