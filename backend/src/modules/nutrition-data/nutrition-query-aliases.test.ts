import assert from "node:assert/strict";
import { test } from "node:test";

import { expandNutritionProviderQueries } from "./nutrition-query-aliases";

const cases: readonly [string, string][] = [
  ["incir", "figs raw"],
  ["incir reçeli", "fig jam"],
  ["toz şeker", "sugar granulated"],
  ["su", "water"],
  ["limon suyu", "lemon juice raw"],
  ["susam", "sesame seeds"],
  ["cevizli sucuk", "walnut churchkhela"],
  ["üzüm pekmezi", "grape molasses"],
  ["ceviz", "walnuts"],
  ["nişasta", "cornstarch"],
  ["un", "wheat flour all purpose"],
  ["buğday unu", "wheat flour all purpose"],
];

for (const [input, expected] of cases) {
  test(`Turkish nutrition query alias resolves ${input}`, () => {
    assert.equal(expandNutritionProviderQueries(input)[0], expected);
  });
}


test("grape molasses keeps a generic molasses fallback for provider corpora", () => {
  assert.deepEqual(
    expandNutritionProviderQueries("üzüm pekmezi").slice(0, 2),
    ["grape molasses", "molasses"],
  );
});
