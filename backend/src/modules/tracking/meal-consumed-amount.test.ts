import assert from "node:assert/strict";
import test from "node:test";

import { createMealLogSchema } from "./tracking.schemas";

test("meal log consumed amount is explicit and paired with its unit", () => {
  const valid = createMealLogSchema.parse({
    mealType: "SNACK",
    name: "Test ürün",
    calories: 100,
    consumedAmount: 25,
    consumedUnit: "g",
  });
  assert.equal(valid.consumedAmount, 25);
  assert.equal(valid.consumedUnit, "g");

  assert.equal(
    createMealLogSchema.safeParse({
      mealType: "SNACK",
      consumedAmount: 25,
    }).success,
    false,
  );
  assert.equal(
    createMealLogSchema.safeParse({
      mealType: "SNACK",
      consumedUnit: "g",
    }).success,
    false,
  );
});

test("legacy meal logs can still be created without consumed amount metadata", () => {
  assert.equal(createMealLogSchema.safeParse({ mealType: "DINNER", calories: 500 }).success, true);
});
