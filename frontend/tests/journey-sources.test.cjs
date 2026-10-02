const test = require("node:test");
const assert = require("node:assert/strict");
const { harness, deferred } = require("./helpers/daily-harness.cjs");
const fail = async () => {
  throw Error("offline");
};
async function complete(h) {
  await h.meals.mealsStore.hydrateMealsFromBackend();
  await h.water.dailyTrackingStore.hydrateWaterFromBackend();
  for (const slot of ["breakfast", "lunch", "dinner"]) await h.meals.mealsStore.markMealEaten(slot);
  h.water.dailyTrackingStore.setWaterGoal(250);
  await h.water.dailyTrackingStore.addWater(250);
  h.setCheckIn({ active: false, required: false, lastLoggedAt: null, nextDueAt: null });
}
for (const scenario of [
  "all unknown",
  "partial complete",
  "true complete",
  "actionable",
  "no-actionable-step",
])
  test(`UI completion uses engine status: ${scenario}`, async () => {
    const h = harness();
    if (scenario !== "all unknown") await complete(h);
    if (scenario === "partial complete") {
      h.client.listWater = fail;
      await h.water.dailyTrackingStore.hydrateWaterFromBackend();
    }
    if (scenario === "actionable") await h.meals.mealsStore.unmarkMealEaten("lunch");
    if (scenario === "no-actionable-step") h.water.dailyTrackingStore.setWaterGoal(500);
    const r = h.journey();
    assert.equal(r.status === "all-done", scenario === "true complete");
    for (const [file, name] of [
      ["daily-journey-section", "DailyJourneySection"],
      ["today-tasks-section", "TodayTasksSection"],
    ]) {
      const html = h.render(`presentation/components/dashboard/${file}.tsx`, name);
      assert.equal(html.includes("tamamladın"), scenario === "true complete");
    }
  });
test("failed water hydrate then successful POST remains visible through failed refresh, never authoritative", async () => {
  const h = harness();
  h.client.listWater = fail;
  await h.water.dailyTrackingStore.hydrateWaterFromBackend();
  h.water.dailyTrackingStore.setWaterGoal(250);
  const log = await h.water.dailyTrackingStore.addWater(250);
  assert.equal(log.amountMl, 250);
  let state = h.water.useDailyTracking();
  assert.equal(state.waterReadiness, "UNKNOWN");
  assert.equal(state.confirmedWaterMl, 250);
  const html = h.render("presentation/components/dashboard/water-section.tsx", "WaterSection");
  assert.match(html, /250 ml kaydın eklendi; günlük toplam doğrulanamadı/);
  assert.equal(h.journey().sufficiency.water, "UNKNOWN");
  assert.equal(
    h.journey().steps.some((s) => s.kind === "water"),
    false,
  );
  await h.water.dailyTrackingStore.removeWater(log.id, 250);
  assert.equal(h.water.useDailyTracking().confirmedWaterMl, 0);
});
test("successful same-day GET replaces partial display without double counting", async () => {
  const h = harness();
  h.client.listWater = fail;
  await h.water.dailyTrackingStore.addWater(250);
  h.client.listWater = async () => ({ logs: [{ amountMl: 250, loggedAt: h.iso() }] });
  await h.water.dailyTrackingStore.hydrateWaterFromBackend();
  assert.equal(h.water.useDailyTracking().waterMl, 250);
  assert.equal(h.journey().sufficiency.water, "KNOWN");
});
test("unknown meals keep persisted foods and check-ins visible after another failed fetch", async () => {
  const h = harness();
  h.mealsClient.listMeals = fail;
  await h.meals.mealsStore.hydrateMealsFromBackend();
  await h.meals.mealsStore.addFood({
    slot: "breakfast",
    time: "10:00",
    food: { name: "Elma", quantity: "1", calories: 80, protein: 0, carbs: 20, fat: 0 },
  });
  await h.meals.mealsStore.markMealEaten("lunch");
  await h.meals.mealsStore.hydrateMealsFromBackend();
  assert.equal(h.meals.useMeals().find((m) => m.slot === "breakfast").foods[0].name, "Elma");
  assert.equal(h.meals.useMeals().find((m) => m.slot === "lunch").isEaten, true);
  assert.equal(h.meals.useMealsReadiness(), "UNKNOWN");
  assert.equal(h.journey().sufficiency.breakfast, "UNKNOWN");
});
test("unknown activity keeps confirmed record visible without claiming a full-day total", async () => {
  const h = harness();
  h.activityClient.listActivities = fail;
  await h.activity.activityStore.hydrateFromBackend();
  await h.activity.activityStore.logActivity({
    type: "WALKING",
    durationMinutes: 15,
    name: "Akşam yürüyüşü",
  });
  await h.activity.activityStore.hydrateFromBackend();
  assert.equal(h.activity.useActivity().activities.length, 1);
  assert.equal(h.activity.useActivity().readiness, "UNKNOWN");
  assert.equal(h.journey().sufficiency.activity, "UNKNOWN");
  const html = h.render("presentation/components/activity/activity-view.tsx", "ActivityView");
  assert.match(html, /15 dk/);
});
test("real sleep endpoint is represented in sufficiency; failure does not become zero", async () => {
  const h = harness();
  await h.sleep.sleepStore.hydrateTodayFromBackend();
  assert.equal(h.journey().sufficiency.sleep, "KNOWN_ZERO");
  h.sleepClient.dailyAssessment = async (date) => ({
    assessment: { date, entries: 1, totalDurationMinutes: 420 },
  });
  await h.sleep.sleepStore.hydrateTodayFromBackend();
  assert.equal(h.journey().sufficiency.sleep, "KNOWN");
  h.sleepClient.dailyAssessment = fail;
  await h.sleep.sleepStore.hydrateTodayFromBackend();
  assert.equal(h.journey().sufficiency.sleep, "UNKNOWN");
});
test("midnight resets all daily sources and confirmed writes, preserving configured water goal", async () => {
  const h = harness();
  await complete(h);
  await h.activity.activityStore.hydrateFromBackend();
  await h.activity.activityStore.logActivity({ type: "WALKING", durationMinutes: 15 });
  await h.sleep.sleepStore.hydrateTodayFromBackend();
  h.journey();
  h.rollover();
  const r = h.journey();
  for (const key of ["breakfast", "water", "activity", "sleep"])
    assert.equal(r.sufficiency[key], "UNKNOWN");
  assert.equal(h.water.useDailyTracking().waterMl, 0);
  assert.equal(h.water.useDailyTracking().confirmedWaterMl, 0);
  assert.equal(h.water.useDailyTracking().waterGoalMl, 250);
  assert.equal(h.meals.useMeals()[0].foods.length, 0);
  assert.equal(h.activity.useActivity().activities.length, 0);
});
test("previous-day rows are filtered out of successful daily collections", async () => {
  const h = harness();
  const yesterday = new Date(h.now().getTime() - 86400000).toISOString();
  h.client.listWater = async () => ({ logs: [{ amountMl: 250, loggedAt: yesterday }] });
  h.activityClient.listActivities = async () => ({
    activities: [{ durationMinutes: 15, loggedAt: yesterday }],
  });
  h.mealsClient.listMeals = async () => ({
    logs: [{ mealType: "BREAKFAST", name: "Elma", loggedAt: yesterday }],
  });
  await h.water.dailyTrackingStore.hydrateWaterFromBackend();
  await h.activity.activityStore.hydrateFromBackend();
  await h.meals.mealsStore.hydrateMealsFromBackend();
  const r = h.journey();
  for (const key of ["water", "activity", "breakfast"])
    assert.equal(r.sufficiency[key], "KNOWN_ZERO");
});
test("unknown sources including successful partial writes are excluded from health score", async () => {
  const h = harness();
  h.client.listWater = fail;
  h.water.dailyTrackingStore.setWaterGoal(250);
  h.activity.activityStore.setActiveMinutesGoal(15);
  await h.water.dailyTrackingStore.addWater(250);
  await h.activity.activityStore.logActivity({ type: "WALKING", durationMinutes: 15 });
  await h.meals.mealsStore.markMealEaten("breakfast");
  assert.equal(h.load("application/health/health-score.ts").useHealthScore().factors.length, 0);
});
test("inactive check-in never schedules weighing and active cadence uses exact time", () => {
  const h = harness();
  h.setCheckIn({ active: false, required: true, lastLoggedAt: null, nextDueAt: null });
  assert.equal(
    h.journey().steps.some((s) => s.kind === "weight"),
    false,
  );
  const due = h.now().getTime() + 1;
  h.setCheckIn({
    active: true,
    required: false,
    lastLoggedAt: null,
    nextDueAt: new Date(due).toISOString(),
  });
  assert.equal(
    h.journey().steps.some((s) => s.kind === "weight"),
    false,
  );
  h.advance(1);
  assert.equal(h.journey().nextBestAction.kind, "weight");
});
for (const source of ["water", "meals", "activity", "sleep"])
  test(`${source}: pending hydrate cannot revive a reset account`, async () => {
    const h = harness();
    const d = deferred();
    let read, payload;
    if (source === "water") {
      h.client.listWater = () => d.promise;
      read = () => h.water.dailyTrackingStore.hydrateWaterFromBackend();
      payload = { logs: [{ amountMl: 250, loggedAt: h.iso() }] };
    }
    if (source === "meals") {
      h.mealsClient.listMeals = () => d.promise;
      read = () => h.meals.mealsStore.hydrateMealsFromBackend();
      payload = { logs: [{ mealType: "BREAKFAST", name: "Old user", loggedAt: h.iso() }] };
    }
    if (source === "activity") {
      h.activityClient.listActivities = () => d.promise;
      read = () => h.activity.activityStore.hydrateFromBackend();
      payload = { activities: [{ durationMinutes: 15, loggedAt: h.iso() }] };
    }
    if (source === "sleep") {
      h.sleepClient.dailyAssessment = () => d.promise;
      read = () => h.sleep.sleepStore.hydrateTodayFromBackend();
      payload = { assessment: { date: "2026-10-02", entries: 1, totalDurationMinutes: 420 } };
    }
    const pending = read();
    h.reset();
    d.resolve(payload);
    await pending;
    const r = h.journey();
    assert.equal(r.sufficiency[source === "meals" ? "breakfast" : source], "UNKNOWN");
    assert.equal(h.water.useDailyTracking().confirmedWaterMl, 0);
    assert.equal(h.activity.useActivity().activities.length, 0);
  });
for (const source of ["water", "meals", "activity"])
  test(`${source}: slow read cannot erase a successful write or certify its partial aggregate`, async () => {
    const h = harness();
    const d = deferred();
    let read, write, empty;
    if (source === "water") {
      h.client.listWater = () => d.promise;
      read = () => h.water.dailyTrackingStore.hydrateWaterFromBackend();
      write = () => h.water.dailyTrackingStore.addWater(250);
      empty = { logs: [] };
    }
    if (source === "meals") {
      h.mealsClient.listMeals = () => d.promise;
      read = () => h.meals.mealsStore.hydrateMealsFromBackend();
      write = () => h.meals.mealsStore.markMealEaten("breakfast");
      empty = { logs: [] };
    }
    if (source === "activity") {
      h.activityClient.listActivities = () => d.promise;
      read = () => h.activity.activityStore.hydrateFromBackend();
      write = () => h.activity.activityStore.logActivity({ type: "WALKING", durationMinutes: 15 });
      empty = { activities: [] };
    }
    const pending = read();
    if (source === "water") h.client.listWater = fail;
    await write();
    d.resolve(empty);
    await pending;
    assert.equal(h.journey().sufficiency[source === "meals" ? "breakfast" : source], "UNKNOWN");
    if (source === "water") assert.equal(h.water.useDailyTracking().confirmedWaterMl, 250);
    if (source === "meals") assert.equal(h.meals.useMeals()[0].isEaten, true);
    if (source === "activity") assert.equal(h.activity.useActivity().activities.length, 1);
  });
for (const source of ["water", "meals", "activity"])
  for (const boundary of ["reset", "midnight"])
    test(`${source}: pending successful write across ${boundary} cannot restore stale aggregate`, async () => {
      const h = harness();
      const d = deferred();
      let write, payload;
      const loggedAt = h.iso();
      if (source === "water") {
        h.client.logWater = () => d.promise;
        h.client.listWater = fail;
        write = () => h.water.dailyTrackingStore.addWater(250);
        payload = { log: { id: "old", amountMl: 250, loggedAt } };
      }
      if (source === "meals") {
        h.mealsClient.logMeal = () => d.promise;
        write = () => h.meals.mealsStore.markMealEaten("breakfast");
        payload = { log: { id: "old", loggedAt } };
      }
      if (source === "activity") {
        h.activityClient.logActivity = () => d.promise;
        write = () =>
          h.activity.activityStore.logActivity({ type: "WALKING", durationMinutes: 15 });
        payload = { activity: { id: "old", durationMinutes: 15, loggedAt } };
      }
      const pending = write();
      if (boundary === "reset") h.reset();
      else h.rollover();
      d.resolve(payload);
      await pending;
      assert.equal(h.journey().sufficiency[source === "meals" ? "breakfast" : source], "UNKNOWN");
      assert.equal(h.water.useDailyTracking().confirmedWaterMl, 0);
      assert.equal(h.meals.useMeals()[0].isEaten, false);
      assert.equal(h.activity.useActivity().activities.length, 0);
    });
test("profile account switch preserves new owner and ignores an old profile response", async () => {
  const h = harness();
  const d = deferred();
  let calls = 0;
  const updates = [];
  h.mocks["@/infrastructure/onboarding/onboarding-client"] = {
    onboardingClient: {
      getProfile: () => (++calls === 1 ? d.promise : Promise.resolve({ profile: null })),
    },
  };
  h.mocks["@/application/health/health-profile-store"].healthProfileStore = {
    reset() {},
    update: (p) => updates.push(p),
  };
  Object.assign(h.mocks["@/application/health/weight-store"], {
    weightStore: { clear() {}, hydrateWeightFromBackend: async () => {} },
  });
  for (const [file, key, method] of [
    ["journey-store", "journeyStore", "hydrateJourneyFromBackend"],
    ["blood-test-store", "bloodTestStore", "hydrateBloodTestsFromBackend"],
    ["nutrition-plan-store", "nutritionPlanStore", "hydrateFromBackend"],
  ])
    h.mocks[`@/application/health/${file}`] = { [key]: { reset() {}, [method]: async () => null } };
  h.mocks["@/application/goals/goals-store"] = { goalsStore: { reset() {} } };
  h.mocks["@/application/chat/chat-store"] = { chatStore: { resetSession() {} } };
  h.mocks["@/application/payments/subscription-store"] = {
    subscriptionStore: { resetSession() {} },
  };
  const profile = h.load("application/health/profile-hydration.ts");
  const old = profile.hydrateProfileFromBackend("old", "Old");
  await profile.hydrateProfileFromBackend("new", "New");
  d.resolve({ profile: { currentWeightKg: 99, dailyWaterGoalMl: 9999 } });
  await old;
  assert.equal(
    updates.some((p) => p.currentWeightKg === 99),
    false,
  );
  assert.equal(h.water.useDailyTracking().waterGoalMl, 0);
});
test("today weight evidence follows the local calendar near UTC midnight", () => {
  const h = harness();
  h.advance(-9.5 * 60 * 60 * 1000);
  h.setCheckIn({ active: true, required: false, lastLoggedAt: h.iso(), nextDueAt: null });
  assert.equal(h.journey().steps.find((s) => s.kind === "weight").state, "completed");
});
test('store rollover renders use the new local day even before the next clock tick', async () => {
  const h = harness();
  const previousTick = h.now();
  h.mocks.react.useState = () => [previousTick, () => {}];
  h.rollover();
  await h.water.dailyTrackingStore.hydrateWaterFromBackend();
  assert.equal(h.journey().sufficiency.water, 'KNOWN_ZERO');
});
