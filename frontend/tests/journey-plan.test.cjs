const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
function load(file) {
  const exports = {};
  const name = path.resolve("src", file);
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(name, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      Date,
      Map,
      Set,
      require: (request) =>
        load(
          request.startsWith("@/")
            ? request.slice(2) + ".ts"
            : path.relative(path.resolve("src"), path.resolve(path.dirname(name), request)) + ".ts",
        ),
    },
  );
  return exports;
}
const { journeyPlanMeals } = load("application/health/journey-plan.ts");
const { buildJourney } = load("application/health/journey-engine.ts");
const food = (name) => ({ name, portion: "1 porsiyon" });
const plan = () => ({
  id: "synthetic",
  isActive: true,
  status: "COMPLETED",
  startDate: "2026-10-23",
  dailyPlans: {
    durationDays: 2,
    calendar: [
      { dayNumber: 1, cycleIndex: 1 },
      { dayNumber: 2, cycleIndex: 0 },
    ],
    cycle: [
      { meals: [{ name: "Kahvaltı", time: "09:15", foods: [food("İkinci gün")] }] },
      {
        meals: [
          { name: "Kahvaltı", time: "08:15", foods: [food("Birinci gün")] },
          { name: "Öğle yemeği", time: "13:15", foods: [food("Mercimek"), food("Salata")] },
        ],
      },
    ],
  },
});
const at = (day = 23, hour = 14) => new Date(2026, 9, day, hour);
test("calendar cycleIndex, not array position or modulo, selects real local today", () => {
  assert.equal(journeyPlanMeals(plan(), at())[1].meal.foods[0].name, "Mercimek");
  assert.equal(journeyPlanMeals(plan(), at(24))[0].meal.foods[0].name, "İkinci gün");
  assert.equal(journeyPlanMeals(plan(), at(25)).length, 0);
  assert.equal(journeyPlanMeals(plan(), at(22)).length, 0);
});
for (const patch of [
  { startDate: undefined },
  { startDate: "2026-02-30" },
  { startDate: "2025-10-23" },
  { isActive: false },
  { deletedAt: "2026-10-23" },
  { status: "PROCESSING" },
])
  test(`unsafe plan ${JSON.stringify(patch)} has no menu`, () =>
    assert.equal(journeyPlanMeals({ ...plan(), ...patch }, at()).length, 0));
test("absent mapping, invalid time and ambiguous slot never allow a guessed checkin", () => {
  let p = plan();
  p.dailyPlans.calendar = [];
  assert.equal(journeyPlanMeals(p, at()).length, 0);
  p = plan();
  p.dailyPlans.cycle[1].meals[0].time = "25:99";
  assert.equal(journeyPlanMeals(p, at()).length, 0);
  p = plan();
  p.dailyPlans.cycle[1].meals[0].name = "Geç kahvaltı";
  assert.equal(journeyPlanMeals(p, at())[0].slot, null);
  p = plan();
  p.dailyPlans.cycle[1].meals.push({ name: "Öğle", time: "16:15", foods: [food("Ek öğün")] });
  assert.ok(
    journeyPlanMeals(p, at())
      .filter((x) => x.meal.name.startsWith("Öğle"))
      .every((x) => x.slot === null),
  );
});
test("postponement and overnight meals share the existing local calendar convention", () => {
  const p = plan();
  p.dailyPlans.calendar = [{ dayNumber: 1, cycleIndex: 1, dateOffsetDays: 1 }];
  p.dailyPlans.cycle[1].meals[0].time = "22:15";
  p.dailyPlans.cycle[1].meals[1].time = "02:15";
  assert.equal(journeyPlanMeals(p, at(23)).length, 0);
  assert.equal(journeyPlanMeals(p, at(24))[0].meal.name, "Kahvaltı");
  assert.equal(journeyPlanMeals(p, at(25))[0].meal.name, "Öğle yemeği");
});
test("existing engine recommends the real pending plan meal and keeps past meals recordable", () => {
  const input = {
    localHour: 14,
    nowMs: at().getTime(),
    plannedMeals: journeyPlanMeals(plan(), at()),
    startWeightKg: 70,
    targetWeightKg: 75,
    currentWeightKg: 70,
    meals: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 },
    waterMl: 0,
    waterGoalMl: 2100,
    activityMinutes: null,
    weight: { due: false, recordedToday: false },
    workScheduleType: "REGULAR",
  };
  const result = buildJourney(input);
  assert.equal(result.direction, "gain");
  assert.equal(result.plannedMeal.slot, "lunch");
  assert.equal(result.nextBestAction.kind, "lunch");
  assert.equal(result.steps.find((x) => x.kind === "breakfast").state, "pending");
  assert.ok(!result.steps.some((x) => x.state === "skipped"));
});
