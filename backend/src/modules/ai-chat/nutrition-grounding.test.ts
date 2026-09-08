import assert from "node:assert/strict";
import { test } from "node:test";

import { parseNutritionQuestion } from "./nutrition-grounding";

test("nutrition grounding parser extracts explicit gram serving", () => {
  assert.deepEqual(parseNutritionQuestion("100 gram tavuk göğsü kaç kalori?"), { query: "tavuk göğsü", grams: 100 });
  assert.deepEqual(parseNutritionQuestion("250 g yoğurt ne kadar protein?"), { query: "yoğurt", grams: 250 });
});

test("nutrition grounding parser defaults generic factual question to per 100g", () => {
  assert.deepEqual(parseNutritionQuestion("elma kaç kalori?"), { query: "elma", grams: 100 });
});

test("unrelated coaching question is not treated as nutrition fact lookup", () => {
  assert.equal(parseNutritionQuestion("Bugün ne yemeliyim?"), null);
});
