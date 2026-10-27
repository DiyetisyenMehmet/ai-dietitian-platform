const test = require("node:test");
const assert = require("node:assert/strict");
const { harness, deferred } = require("./helpers/daily-harness.cjs");

function scenario() {
  const h = harness();
  const { buildJourney } = h.load("application/health/journey-engine.ts");
  const helpers = h.load("application/health/daily-journey.ts");
  const plannedMeals = [
    ["breakfast", "Kahvaltı", "08:00"],
    ["lunch", "Öğle", "13:00"],
    ["snack", "Ara öğün", "18:00"],
    ["dinner", "Akşam", "21:00"],
  ].map(([slot, name, time], index) => ({
    key: String(index),
    slot,
    at: index,
    meal: { name, time, foods: [{ name: "Sentetik", portion: "1 porsiyon" }] },
  }));
  const input = {
    plannedMeals,
    nowMs: 99,
    localHour: 22,
    startWeightKg: 80,
    targetWeightKg: 70,
    currentWeightKg: 78,
    meals: { breakfast: 1, lunch: 1, snack: 0, dinner: 0 },
    waterMl: 0,
    waterGoalMl: 2000,
    activityMinutes: 0,
    weight: { due: false, recordedToday: false },
  };
  return { h, input, helpers, run: (patch = {}) => buildJourney({ ...input, ...patch }) };
}

test("planned snack precedes dinner even late in the day; zero/partial/full/undo keep denominator", () => {
  const { input, run, helpers } = scenario();
  const partial = run();
  assert.equal(partial.plannedMeal.slot, "snack");
  assert.equal(partial.nextBestAction.kind, "snack");
  const states = [
    run({ meals: { breakfast: 0, lunch: 0, snack: 0, dinner: 0 } }),
    run({ meals: { ...input.meals, snack: 1 } }),
    run({ meals: { breakfast: 1, lunch: 1, snack: 1, dinner: 1 }, waterMl: 2000 }),
    run({ meals: { breakfast: 1, lunch: 1, snack: 0, dinner: 1 }, waterMl: 2000 }),
  ];
  assert.deepEqual(
    states.map((r) => helpers.summarizeJourney(r.steps).total),
    [5, 5, 5, 5],
  );
  assert.deepEqual(
    states.map((r) => helpers.summarizeJourney(r.steps).completed),
    [0, 3, 5, 4],
  );
  assert.equal(states[2].status, "all-done");
  assert.equal(states[2].plannedMeal, null);
  assert.notEqual(states[3].status, "all-done");
});

test("optional logs never increase the daily goal; unknown water does not remove its step", () => {
  const { run, helpers } = scenario();
  for (const patch of [
    { activityMinutes: 30 },
    { weight: { due: false, recordedToday: true } },
    { waterMl: 250 },
    { waterMl: null },
  ]) {
    assert.equal(helpers.summarizeJourney(run(patch).steps).total, 5);
  }
  const noPlan = run({ plannedMeals: [] });
  const withOptional = run({
    plannedMeals: [],
    meals: { breakfast: 1, lunch: 1, dinner: 0, snack: 1 },
    activityMinutes: 20,
  });
  assert.equal(helpers.summarizeJourney(noPlan.steps).total, 4);
  assert.equal(helpers.summarizeJourney(withOptional.steps).total, 4);
  assert.notEqual(run({ waterMl: null }).status, "all-done");
});

test("ambiguous plan rows cannot borrow one slot's completion; true plan revisions recalculate", () => {
  const { input, run, helpers } = scenario();
  const changed = [
    ...input.plannedMeals,
    { ...input.plannedMeals[2], key: "second-snack", slot: null },
  ];
  const r = run({
    plannedMeals: changed,
    meals: { breakfast: 1, lunch: 1, snack: 1, dinner: 1 },
    waterMl: 2000,
  });
  assert.equal(helpers.summarizeJourney(r.steps).total, 6);
  assert.equal(r.steps.find((step) => step.id === "second-snack").state, "recommended");
  assert.notEqual(r.status, "all-done");
});

test("check-in and actual nutrition have distinct truthful persisted descriptions", () => {
  const { run } = scenario();
  assert.match(run().steps.find((step) => step.kind === "lunch").hint, /besin kaydı yok/);
  assert.equal(
    run({ foodCounts: { lunch: 1 } }).steps.find((step) => step.kind === "lunch").hint,
    "Besin kaydı var",
  );
});

test("completion folds once, manual reopen/undo survives repeated results; new scope defaults compact inside", () => {
  const { helpers } = scenario();
  const initial = helpers.journeyDisclosure(null);
  assert.equal(initial.inner, false);
  assert.equal(initial.outer, null);
  const complete = helpers.settleJourneyDisclosure(initial, true);
  assert.equal(complete.outer, false);
  assert.equal(complete.completionSeen, true);
  const reopened = { ...complete, outer: true, inner: true };
  assert.equal(helpers.settleJourneyDisclosure(reopened, true), reopened);
  assert.equal(helpers.settleJourneyDisclosure(reopened, false), reopened);
  assert.equal(helpers.journeyDisclosure(JSON.parse(JSON.stringify(reopened))).outer, true);
  assert.equal(helpers.journeyDisclosure(null).completionSeen, false);
});

test("coalesced check-in, observed remote confirmation and uncertain POST never fabricate food/macros", async () => {
  const h = harness();
  await h.meals.mealsStore.hydrateMealsFromBackend();
  const gate = deferred();
  let posts = 0;
  let body;
  h.mealsClient.logMeal = async (input) => {
    posts++;
    body = input;
    return gate.promise;
  };
  const first = h.meals.mealsStore.markMealEaten("lunch");
  const second = h.meals.mealsStore.markMealEaten("lunch");
  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(posts, 1);
  const log = {
    id: "confirmed",
    mealType: "LUNCH",
    name: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    sodiumMg: null,
    sugarG: null,
    loggedAt: h.iso(),
  };
  gate.resolve({ log });
  await first;
  assert.deepEqual(Object.keys(body), ["mealType"]);
  assert.equal(h.meals.computeTotals(h.meals.useMeals()).calories, 0);
  h.reset();
  await h.meals.mealsStore.hydrateMealsFromBackend();
  h.mealsClient.listMeals = async () => ({ logs: [log] });
  await h.meals.mealsStore.markMealEaten("lunch");
  assert.equal(posts, 1); // A stale tab observed the other confirmation; no second POST.
  assert.equal(h.meals.useMeals().find((meal) => meal.slot === "lunch").checkInId, "confirmed");
});

test("lost POST acknowledgement reconciles from persisted log and account switch rejects late results", async () => {
  const h = harness();
  let saved = false;
  const log = {
    id: "persisted",
    mealType: "LUNCH",
    name: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    sodiumMg: null,
    sugarG: null,
    loggedAt: h.iso(),
  };
  h.mealsClient.listMeals = async () => ({ logs: saved ? [log] : [] });
  await h.meals.mealsStore.hydrateMealsFromBackend();
  h.mealsClient.logMeal = async () => {
    saved = true;
    throw Error("lost response");
  };
  await h.meals.mealsStore.markMealEaten("lunch");
  assert.equal(h.meals.useMeals().find((meal) => meal.slot === "lunch").checkInId, "persisted");
  const late = deferred();
  h.mealsClient.listMeals = () => late.promise;
  const pending = h.meals.mealsStore.markMealEaten("dinner");
  h.reset();
  late.resolve({ logs: [log] });
  await pending;
  assert.equal(
    h.meals.useMeals().some((meal) => meal.isEaten),
    false,
  );
});

test("explicit food time reaches the existing API; stale day cannot write", async () => {
  const h = harness();
  let payload;
  h.mealsClient.logMeal = async (input) => {
    payload = input;
    return { log: { ...input, id: "food", loggedAt: input.loggedAt } };
  };
  const food = {
    name: "Sentetik besin",
    quantity: "1 porsiyon",
    calories: 100,
    protein: 5,
    carbs: 10,
    fat: 2,
  };
  await h.meals.mealsStore.addFood({ slot: "lunch", time: "09:15", dayKey: "2026-10-02", food });
  assert.equal(new Date(payload.loggedAt).getHours(), 9);
  assert.equal(new Date(payload.loggedAt).getMinutes(), 15);
  payload = null;
  await assert.rejects(
    h.meals.mealsStore.addFood({ slot: "lunch", time: "09:15", dayKey: "2026-10-01", food }),
    /günü değişti/,
  );
  assert.equal(payload, null);
});

test("failed confirmation preflight cannot initiate another write", async () => {
  const h = harness();
  await h.meals.mealsStore.hydrateMealsFromBackend();
  let posts = 0;
  h.mealsClient.listMeals = async () => {
    throw new Error("Read unavailable");
  };
  h.mealsClient.logMeal = async () => {
    posts++;
    throw new Error("Unexpected write");
  };
  await assert.rejects(h.meals.mealsStore.markMealEaten("lunch"), /Read unavailable/);
  assert.equal(posts, 0);
  assert.equal(
    h.meals.useMeals().some((meal) => meal.isEaten),
    false,
  );
});
