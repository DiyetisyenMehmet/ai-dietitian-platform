import assert from "node:assert/strict";
import { test } from "node:test";

import { parseNutritionBarcode, parseNutritionQuestion } from "./nutrition-grounding";

test("nutrition grounding parser extracts explicit gram serving", () => {
  assert.deepEqual(parseNutritionQuestion("100 gram tavuk göğsü kaç kalori?"), {
    query: "tavuk göğsü",
    grams: 100,
  });
  assert.deepEqual(parseNutritionQuestion("250 g yoğurt ne kadar protein?"), {
    query: "yoğurt",
    grams: 250,
  });
});

test("nutrition grounding parser accepts contextual scan CTA wording", () => {
  assert.deepEqual(
    parseNutritionQuestion("250 g kuru fasulye hakkında doğrulanmış besin verileriyle yorumlar mısın?"),
    { query: "kuru fasulye", grams: 250 },
  );
});

test("nutrition grounding extracts barcode for exact packaged-product resolution", () => {
  assert.equal(
    parseNutritionBarcode("25 g Protein Bar hakkında yorumla. Barkodu 4006381333931."),
    "4006381333931",
  );
  assert.equal(parseNutritionBarcode("Bugün ne yemeliyim?"), null);
});

test("nutrition grounding parser defaults generic factual question to per 100g", () => {
  assert.deepEqual(parseNutritionQuestion("elma kaç kalori?"), { query: "elma", grams: 100 });
});

test("unrelated coaching question is not treated as nutrition fact lookup", () => {
  assert.equal(parseNutritionQuestion("Bugün ne yemeliyim?"), null);
});
