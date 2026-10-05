const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { harness } = require("./helpers/daily-harness.cjs");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

function occurrences(text, value) {
  return text.split(value).length - 1;
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

test("dashboard activates Journey directly after the header without duplicate task or coach hero surfaces", () => {
  const source = read("src/presentation/components/dashboard/dashboard-view.tsx");
  const header = source.indexOf("<DashboardHomeHeader");
  const journey = source.indexOf("<DailyJourneySection");
  const metrics = source.indexOf("<DashboardMetricsSection");

  assert.ok(header >= 0 && journey > header && metrics > journey);
  assert.match(source, /import \{ DailyJourneySection \}/);
  assert.doesNotMatch(source, /TodayTasksSection/);
  assert.doesNotMatch(source, /CoachHeroSection/);
  assert.match(source, /<DashboardAiBanner \/>/);
  assert.match(source, /<TodayProgressSection \/>/);
  assert.match(source, /Koçundan notlar/);
});

test("actionable Journey renders exactly one engine recommendation with a real href and no completion copy", async () => {
  const h = harness();
  await completeJourney(h);
  await h.meals.mealsStore.unmarkMealEaten("lunch");

  const result = h.journey();
  assert.equal(result.status, "actionable");
  assert.equal(result.steps.filter((step) => step.state === "recommended").length, 1);
  assert.ok(result.nextBestAction?.href);
  assert.equal(result.steps.find((step) => step.state === "recommended")?.href, result.nextBestAction.href);

  const html = h.render(
    "presentation/components/dashboard/daily-journey-section.tsx",
    "DailyJourneySection",
  );
  assert.equal(occurrences(html, "Önerilen"), 1);
  assert.doesNotMatch(html, /Bugünün yolculuğunu tamamladın/);
});

test("insufficient-data stays neutral and never presents zero or visible completion as a finished day", () => {
  const h = harness();
  const result = h.journey();
  assert.equal(result.status, "insufficient-data");
  assert.equal(result.steps.length, 0);

  const html = h.render(
    "presentation/components/dashboard/daily-journey-section.tsx",
    "DailyJourneySection",
  );
  assert.match(html, /Veri bekleniyor/);
  assert.match(html, /Bugünkü öneriyi netleştirmek için bazı takip verileri henüz hazır değil/);
  assert.match(html, /Verilerin geldikçe yolculuğun otomatik güncellenecek/);
  assert.doesNotMatch(html, /0\/0 adım/);
  assert.doesNotMatch(html, /%100/);
  assert.doesNotMatch(html, /Bugünün yolculuğunu tamamladın/);
});

test("all-done is the only status that renders the Journey completion message", async () => {
  const h = harness();
  await completeJourney(h);

  const result = h.journey();
  assert.equal(result.status, "all-done");
  assert.equal(result.nextBestAction, null);
  assert.equal(result.steps.some((step) => step.state === "recommended"), false);

  const html = h.render(
    "presentation/components/dashboard/daily-journey-section.tsx",
    "DailyJourneySection",
  );
  assert.match(html, /Bugünün yolculuğunu tamamladın! 🎉/);
  assert.doesNotMatch(html, /Önerilen/);
});

test("no-actionable-step keeps the pending non-link step without inventing navigation or all-done", async () => {
  const h = harness();
  await completeJourney(h);
  h.water.dailyTrackingStore.setWaterGoal(500);

  const result = h.journey();
  const water = result.steps.find((step) => step.kind === "water");
  assert.equal(result.status, "no-actionable-step");
  assert.equal(result.nextBestAction, null);
  assert.equal(water?.state, "pending");
  assert.equal(water?.href, undefined);

  const html = h.render(
    "presentation/components/dashboard/daily-journey-section.tsx",
    "DailyJourneySection",
  );
  assert.match(html, /Şu an açılacak yeni bir adım yok\. Günlük ilerlemeni burada takip edebilirsin\./);
  assert.doesNotMatch(html, /Bugünün yolculuğunu tamamladın/);
});

test("elapsed recording windows use neutral copy instead of claiming the user skipped a meal", async () => {
  const h = harness();
  await h.meals.mealsStore.hydrateMealsFromBackend();
  await h.water.dailyTrackingStore.hydrateWaterFromBackend();
  h.water.dailyTrackingStore.setWaterGoal(250);
  h.setCheckIn({ active: false, required: false, lastLoggedAt: null, nextDueAt: null });
  h.advance(13 * 60 * 60 * 1000);

  const result = h.journey();
  assert.ok(result.steps.some((step) => step.state === "skipped"));

  const { visibleJourneySteps } = h.load("application/health/daily-journey.ts");
  const collapsed = visibleJourneySteps(result.steps, result.status, false);
  const expanded = visibleJourneySteps(result.steps, result.status, true);
  assert.equal(collapsed.some((step) => step.state === "skipped"), false);
  assert.equal(expanded.some((step) => step.state === "skipped"), true);

  const source = read("src/presentation/components/dashboard/daily-journey-section.tsx");
  assert.match(source, /Kayıt zamanı geçti/);
  assert.doesNotMatch(source, />Atlandı</);
});

test("clickable Journey rows keep a visible keyboard focus contract and normal text scaling", () => {
  const source = read("src/presentation/components/dashboard/daily-journey-section.tsx");
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /focus-visible:ring-ring/);
  assert.match(source, /focus-visible:ring-offset-2/);
  assert.doesNotMatch(source, /data-dashboard-fixed-geometry/);
  assert.doesNotMatch(source, /text-size-adjust/);
});
