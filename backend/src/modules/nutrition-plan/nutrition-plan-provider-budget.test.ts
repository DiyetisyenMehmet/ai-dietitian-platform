import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../../utils/api-error";
import {
  checkNutritionProviderBudget,
  nutritionProviderSignal,
  withNutritionProviderBudget,
} from "./nutrition-plan-provider-budget";

test("overall deadline cancels provider transport and prevents retry; budgets are isolated", async () => {
  let calls = 0;
  const long = withNutritionProviderBudget(250, async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    checkNutritionProviderBudget();
    return "other user remains eligible";
  });
  await assert.rejects(
    withNutritionProviderBudget(20, async () => {
      const signal = nutritionProviderSignal(60_000);
      calls++;
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      nutritionProviderSignal(60_000);
      calls++;
    }),
    (error) => error instanceof ApiError && error.code === "NUTRITION_PLAN_GENERATION_TIMEOUT",
  );
  assert.equal(calls, 1);
  assert.equal(await long, "other user remains eligible");
  checkNutritionProviderBudget();
});
