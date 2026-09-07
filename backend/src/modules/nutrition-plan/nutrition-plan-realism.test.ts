import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRealLifePlanningContext,
  findRealLifePlanViolations,
} from "./nutrition-plan-realism";
import type { DailyPlan, PlannedMeal } from "./types";

function meal(name: string, food: string): PlannedMeal {
  return {
    name,
    time: "12:00",
    foods: [{ name: food, portion: "1 porsiyon", calories: 300 }],
    calories: 300,
    proteinGrams: 20,
    carbsGrams: 30,
    fatGrams: 10,
    explanation: "test",
  };
}

function day(...meals: PlannedMeal[]): DailyPlan {
  return {
    dayLabel: "Test",
    meals,
    totalCalories: meals.reduce((sum, item) => sum + item.calories, 0),
    totalProteinGrams: meals.reduce((sum, item) => sum + item.proteinGrams, 0),
    totalCarbsGrams: meals.reduce((sum, item) => sum + item.carbsGrams, 0),
    totalFatGrams: meals.reduce((sum, item) => sum + item.fatGrams, 0),
  };
}

const plantDay = () => day(meal("Öğle", "Mercimek yemeği, bulgur ve yoğurt"));

test("pantry normalization trims, bounds and deduplicates free-form ingredients", () => {
  const context = buildRealLifePlanningContext(" Yumurta, yoğurt; YUMURTA\nMercimek  ");
  assert.equal(context.market, "TR");
  assert.equal(context.budgetProfile, "STANDARD_TR");
  assert.deepEqual(context.pantryIngredients, ["yumurta", "yoğurt", "mercimek"]);
  assert.equal(buildRealLifePlanningContext().pantryIngredients.length, 0);
});

test("zero meat and zero fish is valid because animal protein is never a quota", () => {
  const cycle = Array.from({ length: 14 }, plantDay);
  assert.equal(findRealLifePlanViolations(cycle).length, 0);
});

test("at most three meat-centered meals are allowed in a rolling 14-day window", () => {
  const cycle = Array.from({ length: 14 }, plantDay);
  cycle[0] = day(meal("Akşam", "Izgara tavuk"));
  cycle[4] = day(meal("Akşam", "Dana kıymalı sebze"));
  cycle[9] = day(meal("Akşam", "Kuzu etli sebze"));
  assert.equal(
    findRealLifePlanViolations(cycle).some((item) => item.code === "MEAT_14_DAY_LIMIT"),
    false,
  );

  cycle[13] = day(meal("Akşam", "Dana biftek"));
  assert.equal(
    findRealLifePlanViolations(cycle).some((item) => item.code === "MEAT_14_DAY_LIMIT"),
    true,
  );
});

test("rolling meat limit includes prior preserved days across generation batches", () => {
  const priorDays = Array.from({ length: 10 }, plantDay);
  priorDays[0] = day(meal("Akşam", "Tavuk yemeği"));
  priorDays[3] = day(meal("Akşam", "Dana kıyma"));
  priorDays[7] = day(meal("Akşam", "Kuzu eti"));

  const violations = findRealLifePlanViolations(
    [day(meal("Akşam", "Izgara tavuk"))],
    11,
    priorDays,
  );
  assert.equal(violations.some((item) => item.code === "MEAT_14_DAY_LIMIT"), true);
});

test("fish is optional and limited to two meals in a rolling 14-day window", () => {
  const cycle = Array.from({ length: 14 }, plantDay);
  cycle[1] = day(meal("Akşam", "Fırında hamsi"));
  cycle[8] = day(meal("Akşam", "Izgara levrek"));
  assert.equal(
    findRealLifePlanViolations(cycle).some((item) => item.code === "FISH_14_DAY_LIMIT"),
    false,
  );

  cycle[12] = day(meal("Akşam", "Fırında çipura"));
  assert.equal(
    findRealLifePlanViolations(cycle).some((item) => item.code === "FISH_14_DAY_LIMIT"),
    true,
  );
});

test("processed meat is exceptional rather than routine breakfast protein", () => {
  const cycle = Array.from({ length: 14 }, plantDay);
  cycle[1] = day(meal("Kahvaltı", "Hindi füme"));
  cycle[9] = day(meal("Kahvaltı", "Dana füme"));
  assert.equal(
    findRealLifePlanViolations(cycle).some(
      (item) => item.code === "PROCESSED_MEAT_14_DAY_LIMIT",
    ),
    true,
  );
});

test("meat or fish cannot center multiple meals on the same day", () => {
  const violations = findRealLifePlanViolations([
    day(meal("Öğle", "Izgara tavuk"), meal("Akşam", "Dana kıymalı yemek")),
  ]);
  assert.equal(violations.some((item) => item.code === "MULTIPLE_ANIMAL_MEALS"), true);
});

test("egg, dairy, legumes, plant kofte and hindiba are not classified as meat", () => {
  const cycle = [
    day(
      meal("Kahvaltı", "Yumurta, beyaz peynir ve hindiba"),
      meal("Öğle", "Mercimek köftesi ve yoğurt"),
      meal("Akşam", "Nohut yemeği ve bulgur"),
    ),
  ];
  assert.equal(findRealLifePlanViolations(cycle).length, 0);
});

test("STANDARD_TR limits repeated specialty shopping but pantry items are reusable", () => {
  const specialtyCycle = Array.from({ length: 4 }, () =>
    day(meal("Kahvaltı", "Avokadolu tam tahıllı ekmek")),
  );
  assert.equal(
    findRealLifePlanViolations(specialtyCycle).some(
      (item) => item.code === "SPECIALTY_14_DAY_LIMIT",
    ),
    true,
  );

  const context = buildRealLifePlanningContext("avokado");
  assert.equal(
    findRealLifePlanViolations(specialtyCycle, 1, [], context).some(
      (item) => item.code === "SPECIALTY_14_DAY_LIMIT",
    ),
    false,
  );
});
