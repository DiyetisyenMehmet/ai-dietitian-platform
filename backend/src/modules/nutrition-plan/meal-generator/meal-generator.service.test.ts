import assert from "node:assert/strict";
import test from "node:test";
import { setAIAdapter } from "../../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { ApiError } from "../../../utils/api-error";
import { FixtureAdapter } from "../test-fixtures/provider";
import { buildRealLifePlanningContext } from "../nutrition-plan-realism";
import type {
  NutritionPlanAIInput,
  NutritionPlanAIOutput,
  NutritionPlanGenerationInput,
} from "../types";
import { mealGeneratorService } from "./meal-generator.service";

const input: NutritionPlanGenerationInput = {
  goal: "LOSE_WEIGHT",
  dailyCalories: 1905,
  proteinGrams: 140,
  carbsGrams: 193,
  fatGrams: 64,
  waterMl: 2500,
  dietaryPreference: "OMNIVORE",
  allergies: [],
  healthConditions: [],
  bloodTestImplications: [],
  durationDays: 7,
  realLifePlanning: buildRealLifePlanningContext(),
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

class ObservedProvider extends FixtureAdapter {
  inputs: NutritionPlanAIInput[] = [];
  outputs: NutritionPlanAIOutput[] = [];
  fault?: (output: NutritionPlanAIOutput, call: number) => void;
  override async generateNutritionPlan(request: NutritionPlanAIInput) {
    this.inputs.push(structuredClone(request));
    const output = await super.generateNutritionPlan(request);
    this.fault?.(output, this.inputs.length);
    this.outputs.push(structuredClone(output));
    return output;
  }
}

test("repairs only noncontiguous invalid days with numerical feedback; preserves valid provider values", async () => {
  const provider = new ObservedProvider();
  provider.fault = (output, call) => {
    if (call === 1) for (const index of [1, 4]) output.cycle[index].totalProteinGrams = 60;
  };
  setAIAdapter(provider);
  const result = await mealGeneratorService.generate(input);
  assert.equal(provider.inputs.length, 3);
  assert.deepEqual(provider.inputs[1].requestedDayNumbers, [2, 5]);
  assert.equal(provider.inputs[1].cycleLengthDays, 2);
  const feedback = provider.inputs[1].validationFeedback!.map((item) => JSON.parse(item));
  assert.equal(feedback[0].reported.protein, 60);
  assert.equal(feedback[0].mealSum.protein, 140);
  assert.ok(
    feedback[0].issues.some((issue: { kind: string }) => issue.kind === "MEAL_SUM_MISMATCH"),
  );
  for (const index of [0, 2, 3])
    assert.deepEqual(result.output.cycle[index], provider.outputs[0].cycle[index]);
  assert.deepEqual(
    result.output.cycle.map((day) => day.dayLabel),
    Array.from({ length: 7 }, (_, i) => `${i + 1}. Gün`),
  );
  assert.equal(
    result.output.cycle[1].totalProteinGrams,
    provider.outputs[1].cycle[0].totalProteinGrams,
  );
});

test("a target-invalid repair is rejected without scaling values or further generation", async () => {
  const provider = new ObservedProvider();
  provider.fault = (output) => {
    output.cycle[0].totalCalories = 800;
  };
  setAIAdapter(provider);
  await assert.rejects(
    mealGeneratorService.generate(input),
    (error) => error instanceof ApiError && error.code === "NUTRITION_PLAN_TARGET_MISMATCH",
  );
  assert.equal(provider.inputs.length, 2);
  assert.deepEqual(provider.inputs[1].requestedDayNumbers, [1]);
  assert.equal(provider.outputs[1].cycle[0].totalCalories, 800);
});

test("repairs day-specific realism violations with the affected day range and feedback", async () => {
  const provider = new ObservedProvider();
  provider.fault = (output, call) => {
    if (call !== 1) return;
    for (const [dayIndex, meals] of [
      [1, ["Tavuk", "Levrek"]],
      [2, ["Tavuk", "Kıyma"]],
    ] as const) {
      meals.forEach((name, mealIndex) => {
        output.cycle[dayIndex].meals[mealIndex].name = name;
        output.cycle[dayIndex].meals[mealIndex].foods[0].name = name;
      });
    }
  };
  setAIAdapter(provider);
  const result = await mealGeneratorService.generate(input);
  assert.equal(provider.inputs.length, 3);
  assert.deepEqual(provider.inputs[1].requestedDayNumbers, [2, 3]);
  assert.equal(provider.inputs[1].cycleLengthDays, 2);
  assert.ok(
    provider.inputs[1].validationFeedback?.some((item) => item.includes("MEAT_AND_FISH_SAME_DAY")),
  );
  assert.equal(result.output.cycle.length, 7);
  assert.deepEqual(
    result.output.cycle.map((day) => day.dayLabel),
    Array.from({ length: 7 }, (_, i) => `${i + 1}. Gün`),
  );
});

test("an incomplete partial repair is rejected rather than persisting a partial horizon", async () => {
  const provider = new ObservedProvider();
  provider.fault = (output, call) => {
    if (call === 1) output.cycle[0].totalCalories = 800;
    if (call === 2) output.cycle = [];
  };
  setAIAdapter(provider);
  await assert.rejects(
    mealGeneratorService.generate(input),
    (error) => error instanceof ApiError && error.code === "NUTRITION_PLAN_INCOMPLETE",
  );
  assert.equal(provider.inputs.length, 2);
});

test("a partial repair is rechecked for allergy and meal structure before acceptance", async () => {
  for (const fault of ["allergen", "structure"]) {
    const provider = new ObservedProvider();
    provider.fault = (output, call) => {
      if (call === 1) output.cycle[0].totalCalories = 800;
      if (call === 2 && fault === "allergen")
        output.cycle[0].meals[0].foods[0].ingredients = ["mercimek", "peanut sauce"];
      if (call === 2 && fault === "structure") output.cycle[0].meals.pop();
    };
    setAIAdapter(provider);
    await assert.rejects(
      mealGeneratorService.generate({ ...input, allergies: ["peanut"] }),
      (error) =>
        error instanceof ApiError &&
        error.code ===
          (fault === "allergen"
            ? "NUTRITION_PLAN_ALLERGEN_VALIDATION_FAILED"
            : "NUTRITION_PLAN_MEAL_STRUCTURE_MISMATCH"),
    );
    assert.equal(provider.inputs.length, 2);
  }
});

test("malformed output receives only the existing bounded full-batch retry", async () => {
  const provider = new ObservedProvider();
  provider.mode = "malformed-once";
  setAIAdapter(provider);
  const result = await mealGeneratorService.generate(input);
  assert.equal(result.output.cycle.length, 7);
  assert.equal(provider.inputs.length, 3);
  assert.equal(provider.inputs[1].requestedDayNumbers, undefined);
});
