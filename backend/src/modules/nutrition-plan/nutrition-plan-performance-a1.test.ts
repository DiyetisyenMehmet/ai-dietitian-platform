import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { setAIAdapter } from "../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { findAllergenViolations } from "./meal-generator/allergen-validator";
import { mealGeneratorService } from "./meal-generator/meal-generator.service";
import { buildRealLifePlanningContext, findRealLifePlanViolations } from "./nutrition-plan-realism";
import { FixtureAdapter } from "./test-fixtures/provider";
import { createNutritionTimings, roundNutritionTimings, timeNutritionPhase } from "./nutrition-plan-generation-timings";
import type { NutritionPlanGenerationInput } from "./types";

/** Controlled provider timings are NOT live Vertex timings. */
const baseline: NutritionPlanGenerationInput = {
  goal: "LOSE_WEIGHT",
  dailyCalories: 1905,
  proteinGrams: 140,
  carbsGrams: 193,
  fatGrams: 64,
  waterMl: 2500,
  dietaryPreference: "OMNIVORE",
  allergies: ["fıstık"],
  healthConditions: [],
  bloodTestImplications: [],
  behaviorInsights: [],
  realLifePlanning: buildRealLifePlanningContext(),
  durationDays: 7,
  mealTiming: {
    mealsPerDay: 4,
    slots: [
      { name: "Kahvaltı", time: "08:00", calorieShare: 0.3 },
      { name: "Öğle", time: "13:00", calorieShare: 0.35 },
      { name: "Ara", time: "16:00", calorieShare: 0.1 },
      { name: "Akşam", time: "19:00", calorieShare: 0.25 },
    ],
  },
};

for (const days of [7, 14, 30]) {
  test(`controlled provider fixture, complete ${days}-day plan, targets and safety`, async () => {
    const provider = new FixtureAdapter();
    provider.delay = 25;
    setAIAdapter(provider);
    const input = { ...baseline, durationDays: days };
    const metrics = createNutritionTimings();
    const t0 = performance.now();
    const generated = await timeNutritionPhase(metrics, "aiWallMs", () =>
      mealGeneratorService.generate(input, metrics),
    );
    const elapsedMs = Math.round(performance.now() - t0);
    assert.equal(generated.output.cycle.length, days);
    assert.equal(provider.calls, Math.ceil(days / 5));
    assert.ok(metrics.aiProviderMs >= provider.calls * 20);
    assert.ok(metrics.nutritionValidationMs >= 0);
    assert.ok(metrics.healthValidationMs >= 0);
    assert.ok(metrics.aiWallMs >= 0);
    assert.deepEqual(generated.output.cycle.map((day) => day.dayLabel), Array.from({ length: days }, (_, i) => `${i + 1}. Gün`));
    assert.equal(findAllergenViolations(generated.output.cycle, input.allergies).length, 0);
    assert.equal(findRealLifePlanViolations(generated.output.cycle, 1, [], input.realLifePlanning).length, 0);
    for (const day of generated.output.cycle) {
      assert.equal(day.meals.length, input.mealTiming.mealsPerDay);
      assert.equal(day.totalCalories, input.dailyCalories);
      assert.equal(day.totalProteinGrams, input.proteinGrams);
      assert.equal(day.totalCarbsGrams, input.carbsGrams);
      assert.equal(day.totalFatGrams, input.fatGrams);
    }
    console.log("NUTRITION_PERF_CONTROLLED " + JSON.stringify({ days, elapsedMs, phasesMs: roundNutritionTimings(metrics), providerCalls: provider.calls, artificialProviderDelayMs: 25, source: "fixture", saved: false }));
  });
}

test("generation phase timer measures elapsed time even when a phase fails", async () => {
  const metrics = createNutritionTimings();
  await assert.rejects(
    timeNutritionPhase(metrics, "nutritionDataMs", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("controlled data error");
    }),
    /controlled data error/,
  );
  assert.ok(metrics.nutritionDataMs >= 4);
  assert.equal(metrics.persistenceMs, 0);
});
