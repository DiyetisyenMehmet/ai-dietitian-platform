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
];

for (const [input, expected] of cases) {
  test(`Turkish nutrition query alias resolves ${input}`, () => {
    assert.equal(expandNutritionProviderQueries(input)[0], expected);
  });
}
