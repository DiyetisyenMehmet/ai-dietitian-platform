import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { setAIAdapter } from "../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { findAllergenViolations } from "./meal-generator/allergen-validator";
import { mealGeneratorService } from "./meal-generator/meal-generator.service";
import { buildRealLifePlanningContext, findRealLifePlanViolations } from "./nutrition-plan-realism";
import { FixtureAdapter } from "./test-fixtures/provider";
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
    const t0 = performance.now();
    const generated = await mealGeneratorService.generate(input);
    const elapsedMs = Math.round(performance.now() - t0);
    assert.equal(generated.output.cycle.length, days);
    assert.equal(provider.calls, Math.ceil(days / 5));
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
    console.log("NUTRITION_PERF_CONTROLLED " + JSON.stringify({ days, elapsedMs, providerCalls: provider.calls, artificialProviderDelayMs: 25, source: "fixture", saved: false }));
  });
}
