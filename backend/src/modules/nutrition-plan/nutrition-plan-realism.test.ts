import test from "node:test";
import assert from "node:assert/strict";

import { buildRealLifePlanningContext, findRealLifePlanViolations } from "./nutrition-plan-realism";
import type { DailyPlan, PlannedMeal } from "./types";

function meal(name: string, food: string): PlannedMeal {
  return { name, time: "12:00", foods: [{ name: food, portion: "1 porsiyon", calories: 300 }], calories: 300, proteinGrams: 20, carbsGrams: 30, fatGrams: 10, explanation: "test" };
}
function day(...meals: PlannedMeal[]): DailyPlan {
  return { dayLabel: "Test", meals, totalCalories: meals.reduce((sum, item) => sum + item.calories, 0), totalProteinGrams: 0, totalCarbsGrams: 0, totalFatGrams: 0 };
}

test("pantry normalization trims and deduplicates free-form ingredients", () => {
  const context = buildRealLifePlanningContext(" Yumurta, yoğurt; YUMURTA\nMercimek  ");
  assert.equal(context.market, "TR");
  assert.equal(context.budgetProfile, "STANDARD_TR");
  assert.deepEqual(context.pantryIngredients, ["yumurta", "yoğurt", "mercimek"]);
  assert.equal(buildRealLifePlanningContext().pantryIngredients.length, 0);
});

test("meat is accepted only on occasional deterministic days", () => {
  assert.equal(findRealLifePlanViolations([day(meal("Öğle", "Izgara tavuk"))], 2).length, 0);
  assert.ok(findRealLifePlanViolations([day(meal("Öğle", "Dana biftek"))], 3).some((item) => item.code === "MEAT_DAY_NOT_ALLOWED"));
});

test("fish is optional and restricted to two 14-day positions", () => {
  assert.equal(findRealLifePlanViolations([day(meal("Akşam", "Fırında levrek"))], 5).length, 0);
  assert.ok(findRealLifePlanViolations([day(meal("Akşam", "Somon"))], 6).some((item) => item.code === "FISH_DAY_NOT_ALLOWED"));
});

test("processed meat is not normalized as routine breakfast protein", () => {
  assert.ok(findRealLifePlanViolations([day(meal("Kahvaltı", "Hindi füme"))], 2).some((item) => item.code === "PROCESSED_DAY_NOT_ALLOWED"));
});

test("multiple meat or fish meals on one day are rejected", () => {
  assert.ok(findRealLifePlanViolations([day(meal("Öğle", "Izgara tavuk"), meal("Akşam", "Dana kıyma"))], 7).some((item) => item.code === "MULTIPLE_ANIMAL_MEALS"));
});

test("egg dairy legumes and mercimek köftesi are not meat", () => {
  const cycle = [day(meal("Kahvaltı", "Yumurta ve beyaz peynir"), meal("Öğle", "Mercimek köftesi ve yoğurt"), meal("Akşam", "Nohut yemeği ve bulgur"))];
  assert.equal(findRealLifePlanViolations(cycle, 1).length, 0);
});
