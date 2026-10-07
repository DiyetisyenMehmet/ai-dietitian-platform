const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { harness } = require("./helpers/daily-harness.cjs");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

async function completeJourney(h) {
  await h.meals.mealsStore.hydrateMealsFromBackend();
  await h.water.dailyTrackingStore.hydrateWaterFromBackend();
  for (const slot of ["breakfast", "lunch", "dinner"]) {
    await h.meals.mealsStore.markMealEaten(slot);
  }
  h.water.dailyTrackingStore.setWaterGoal(250);
  await h.water.dailyTrackingStore.addWater(250);
  h.setCheckIn({ active: false, required: false, lastLoggedAt: null, nextDueAt: null });
}

test("compact actionable view exposes only the engine recommendation", async () => {
  const h = harness();
  await completeJourney(h);
  await h.meals.mealsStore.unmarkMealEaten("lunch");
  const result = h.journey();
  const { visibleJourneySteps } = h.load("application/health/daily-journey.ts");

  const collapsed = visibleJourneySteps(result.steps, result.status, false);
  assert.equal(result.status, "actionable");
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].state, "recommended");
  assert.equal(collapsed[0].kind, result.nextBestAction.kind);
  assert.equal(collapsed[0].href, result.nextBestAction.href);

  const html = h.render(
    "presentation/components/dashboard/daily-journey-section.tsx",
    "DailyJourneySection",
  );
  assert.match(html, /data-visible-journey-steps="1"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-label="Yolculuk detaylarını aç"/);
  assert.doesNotMatch(html, /Tümünü göster/);
  assert.match(html, /Öğle yemeği/);
  assert.doesNotMatch(html, /Kahvaltı/);
  assert.doesNotMatch(html, /Akşam yemeği/);
});

test("completed steps stay out of compact view and return in expanded detail", async () => {
  const h = harness();
  await h.meals.mealsStore.hydrateMealsFromBackend();
  await h.water.dailyTrackingStore.hydrateWaterFromBackend();
  await h.meals.mealsStore.markMealEaten("breakfast");
  h.water.dailyTrackingStore.setWaterGoal(500);
  h.setCheckIn({ active: false, required: false, lastLoggedAt: null, nextDueAt: null });

  const result = h.journey();
  const { visibleJourneySteps } = h.load("application/health/daily-journey.ts");
  const collapsed = visibleJourneySteps(result.steps, result.status, false);
  const expanded = visibleJourneySteps(result.steps, result.status, true);

  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].state, "recommended");
  assert.equal(collapsed.some((step) => step.state === "completed"), false);
  assert.ok(expanded.some((step) => step.kind === "breakfast" && step.state === "completed"));
});

test("all-done collapses to success while expanded detail retains completed rows", async () => {
  const h = harness();
  await completeJourney(h);
  const result = h.journey();
  const { visibleJourneySteps } = h.load("application/health/daily-journey.ts");

  assert.equal(result.status, "all-done");
  assert.equal(visibleJourneySteps(result.steps, result.status, false).length, 0);
  assert.equal(visibleJourneySteps(result.steps, result.status, true).length, result.steps.length);

  const html = h.render(
    "presentation/components/dashboard/daily-journey-section.tsx",
    "DailyJourneySection",
  );
  assert.match(html, /Bugünün yolculuğunu tamamladın! 🎉/);
  assert.match(html, /%100/);
  assert.match(html, /aria-label="Yolculuk detaylarını aç"/);
  assert.doesNotMatch(html, /Tümünü göster/);
  assert.doesNotMatch(html, /data-journey-row/);
});

test("insufficient-data stays neutral and compact without fabricated progress", () => {
  const h = harness();
  const result = h.journey();
  const { visibleJourneySteps } = h.load("application/health/daily-journey.ts");

  assert.equal(result.status, "insufficient-data");
  assert.equal(visibleJourneySteps(result.steps, result.status, false).length, 0);
  const html = h.render(
    "presentation/components/dashboard/daily-journey-section.tsx",
    "DailyJourneySection",
  );
  assert.match(html, /Veri bekleniyor/);
  assert.doesNotMatch(html, /0\/0 adım/);
  assert.doesNotMatch(html, /%100/);
  assert.doesNotMatch(html, /Bugünün yolculuğunu tamamladın/);
});

test("no-actionable-step may show pending water but never invents its href", async () => {
  const h = harness();
  await completeJourney(h);
  h.water.dailyTrackingStore.setWaterGoal(500);
  const result = h.journey();
  const { visibleJourneySteps } = h.load("application/health/daily-journey.ts");

  const collapsed = visibleJourneySteps(result.steps, result.status, false);
  assert.equal(result.status, "no-actionable-step");
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].kind, "water");
  assert.equal(collapsed[0].state, "pending");
  assert.equal(collapsed[0].href, undefined);
  assert.equal(result.nextBestAction, null);
});

test("compact control is a real accessible local-state button", () => {
  const source = read("src/presentation/components/dashboard/daily-journey-section.tsx");
  assert.match(source, /type="button"/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /aria-controls=\{detailsId\}/);
  assert.match(source, /onClick=\{\(\) => onExpandedChange\(!expanded\)\}/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /min-h-10 min-w-10/);
  assert.match(source, /React\.useState\(false\)/);
});

test("compact selector is presentation-only and preserves skipped wording", () => {
  const daily = read("src/application/health/daily-journey.ts");
  const engine = read("src/application/health/journey-engine.ts");
  const section = read("src/presentation/components/dashboard/daily-journey-section.tsx");

  assert.match(daily, /step\.state === "recommended"/);
  assert.match(daily, /step\.state === "pending"/);
  assert.doesNotMatch(daily, /href.*water|water.*href/);
  assert.match(section, /Kayıt zamanı geçti/);
  assert.doesNotMatch(section, />Atlandı</);
  assert.match(engine, /const next = steps\.find\(\(step\) => step\.state === "pending" && Boolean\(step\.href\)\)/);
});
