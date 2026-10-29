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
const { journeyPlanMeals, journeyPlanDay } = load("application/health/journey-plan.ts");
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
  p.dailyPlans.durationDays = 1;
  p.dailyPlans.calendar = [{ dayNumber: 1, cycleIndex: 1, dateOffsetDays: 1 }];
  p.dailyPlans.cycle[1].meals[0].time = "22:15";
  p.dailyPlans.cycle[1].meals[1].time = "02:15";
  assert.equal(journeyPlanMeals(p, at(23)).length, 0);
  assert.equal(journeyPlanMeals(p, at(24))[0].meal.name, "Kahvaltı");
  assert.equal(journeyPlanMeals(p, at(25))[0].meal.name, "Öğle yemeği");
});
test("current planned meal is recommended while earlier unconfirmed meals stay recordable", () => {
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

function calendarPlan(days) {
  const p = plan();
  p.startDate = "2026-10-21";
  p.dailyPlans.durationDays = days;
  p.dailyPlans.calendar = Array.from({ length: days }, (_, i) => ({
    dayNumber: i + 1,
    cycleIndex: days - i - 1,
  }));
  p.dailyPlans.cycle = Array.from({ length: days }, (_, i) => ({
    meals: [
      { name: "Kahvaltı", time: "08:00", foods: [food(`Gün ${days - i} kahvaltısı`)] },
      { name: "Öğle yemeği", time: "13:00", foods: [food(`Gün ${days - i} öğlesi`)] },
      { name: "Akşam yemeği", time: "19:00", foods: [food(`Gün ${days - i} akşamı`)] },
    ],
  }));
  return p;
}
function journeyFor(p, now, patch = {}) {
  return buildJourney({
    localHour: now.getHours(),
    nowMs: now.getTime(),
    plannedMeals: journeyPlanMeals(p, now),
    workScheduleType: "NIGHT_SHIFT",
    meals: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 },
    foodCounts: {},
    startWeightKg: 70,
    currentWeightKg: 70,
    targetWeightKg: 65,
    waterMl: 0,
    waterGoalMl: 2500,
    activityMinutes: null,
    weight: { due: true, recordedToday: false },
    ...patch,
  });
}
for (const days of [7, 14, 30]) {
  test(`11-A: ${days} days use real mapped menus, inclusive boundaries and expiration`, () => {
    const p = calendarPlan(days);
    for (const day of [1, Math.ceil(days / 2), days]) {
      const now = new Date(2026, 9, 20 + day, 19);
      const result = journeyPlanDay(p, now);
      assert.equal(result.status, "active");
      assert.equal(result.meals.length, 3);
      assert.equal(result.meals[2].meal.foods[0].name, `Gün ${day} akşamı`);
      assert.equal(journeyFor(p, now).plannedMeal.meal.foods[0].name, `Gün ${day} akşamı`);
    }
    assert.equal(journeyPlanDay(p, new Date(2026, 9, 20, 23)).status, "upcoming");
    const expired = journeyPlanDay(p, new Date(2026, 9, 21 + days, 0));
    assert.equal(expired.status, "expired");
    assert.equal(expired.meals.length, 0);
  });
}
test("11-A: video plan ends 27 October and cannot supply a meal on 28 October", () => {
  const result = journeyPlanDay(calendarPlan(7), new Date(2026, 9, 28, 19));
  assert.equal(result.status, "expired");
  assert.equal(result.endsOn, "2026-10-27");
  assert.equal(result.meals.length, 0);
  assert.equal(journeyPlanDay(null, new Date()).status, "none");
  const p = calendarPlan(7);
  p.dailyPlans.calendar.pop();
  assert.equal(journeyPlanDay(p, new Date(2026, 9, 28)).status, "unavailable");
});
for (const [hour, slot, timing] of [
  [7, "breakfast", "upcoming"],
  [8, "breakfast", "now"],
  [14, "lunch", "now"],
  [19, "dinner", "now"],
  [23, "dinner", "earlier"],
]) {
  test(`11-A: ${hour}:00 highlights ${slot}, not the oldest unfinished meal or weighing`, () => {
    const r = journeyFor(calendarPlan(7), new Date(2026, 9, 21, hour));
    assert.equal(r.plannedMeal.slot, slot);
    assert.equal(r.plannedMeal.timing, timing);
    assert.equal(r.nextBestAction.kind, slot);
    assert.equal(
      r.steps.some((s) => s.state === "skipped"),
      false,
    );
    assert.equal(r.steps.find((s) => s.kind === "weight").state, "pending");
    if (hour >= 14) assert.equal(r.steps.find((s) => s.kind === "breakfast").state, "pending");
  });
}
test("11-A: completed current meal selects upcoming, then earlier unconfirmed without skipping", () => {
  const p = calendarPlan(7);
  const next = journeyFor(p, new Date(2026, 9, 21, 14), {
    meals: { breakfast: 0, lunch: 1, dinner: 0 },
  });
  assert.equal(next.plannedMeal.slot, "dinner");
  assert.equal(next.plannedMeal.timing, "upcoming");
  const earlier = journeyFor(p, new Date(2026, 9, 21, 20), {
    meals: { breakfast: 0, lunch: 0, dinner: 1 },
  });
  assert.equal(earlier.plannedMeal.slot, "lunch");
  assert.equal(earlier.plannedMeal.timing, "earlier");
  assert.equal(earlier.steps.find((s) => s.kind === "breakfast").state, "pending");
});
test("11-A: evening upcoming meal wins over hours-old unconfirmed lunch", () => {
  const p = calendarPlan(7);
  p.dailyPlans.cycle[6].meals[2].time = "19:25";
  const r = journeyFor(p, new Date(2026, 9, 21, 19));
  assert.equal(r.plannedMeal.slot, "dinner");
  assert.equal(r.plannedMeal.timing, "upcoming");
  assert.equal(r.steps.find((s) => s.kind === "lunch").state, "pending");
});
test("11-A: postponed and overnight final meals retain real dates, including expiration", () => {
  const p = calendarPlan(1);
  p.dailyPlans.calendar[0].dateOffsetDays = 1;
  p.dailyPlans.cycle[0].meals = [
    { name: "Akşam yemeği", time: "22:00", foods: [food("Gece ana öğünü")] },
    { name: "Ara öğün", time: "02:00", foods: [food("Gece ara öğünü")] },
  ];
  assert.equal(journeyPlanDay(p, new Date(2026, 9, 21, 23)).status, "upcoming");
  assert.equal(
    journeyPlanDay(p, new Date(2026, 9, 23, 1)).meals[0].meal.foods[0].name,
    "Gece ara öğünü",
  );
  assert.equal(journeyPlanDay(p, new Date(2026, 9, 23, 1)).endsOn, "2026-10-23");
  assert.equal(journeyPlanDay(p, new Date(2026, 9, 24)).status, "expired");
});
test("11-A: one snack is trackable; duplicate snacks show real menus without shared confirmation", () => {
  const p = calendarPlan(1);
  p.dailyPlans.cycle[0].meals.splice(2, 0, {
    name: "Ara öğün",
    time: "16:00",
    foods: [food("İlk ara öğün")],
  });
  assert.equal(journeyFor(p, new Date(2026, 9, 21, 17)).plannedMeal.slot, "snack");
  p.dailyPlans.cycle[0].meals.splice(3, 0, {
    name: "Ara öğün",
    time: "18:00",
    foods: [food("Diğer ara öğün")],
  });
  const r = journeyFor(p, new Date(2026, 9, 21, 17), {
    meals: { breakfast: 0, lunch: 0, dinner: 0, snack: 1 },
  });
  assert.equal(r.plannedMeal.slot, null);
  assert.equal(r.plannedMeal.meal.foods[0].name, "İlk ara öğün");
  const snacks = r.steps.filter((s) => s.kind === "planned-meal");
  assert.equal(snacks.length, 2);
  assert.ok(snacks.every((s) => s.state !== "completed" && s.countsTowardProgress === false));
  const done = journeyFor(p, new Date(2026, 9, 21, 20), {
    meals: { breakfast: 1, lunch: 1, dinner: 1, snack: 1 },
    waterMl: 2500,
  });
  assert.equal(done.status, "all-done");
  assert.equal(done.nextBestAction, null);
  assert.equal(done.steps.filter((s) => s.state === "recommended").length, 0);
  assert.ok(
    done.steps.filter((s) => s.kind === "planned-meal").every((s) => s.state === "pending"),
  );
});
