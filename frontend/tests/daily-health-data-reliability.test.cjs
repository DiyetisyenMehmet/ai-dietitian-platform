const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

function loadDailyHelpers() {
  const source = read("src/application/health/daily-data-readiness.ts");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Date, Math, Number, String });
  return exports;
}

test("daily readiness distinguishes UNKNOWN, KNOWN_ZERO and KNOWN semantics", () => {
  const helpers = loadDailyHelpers();
  assert.equal(helpers.readinessFromCount(0), "KNOWN_ZERO");
  assert.equal(helpers.readinessFromCount(1), "KNOWN");
});

test("local-day helpers do not use UTC date strings for daily cache identity", () => {
  const source = read("src/application/health/daily-data-readiness.ts");
  assert.match(source, /getFullYear\(\)/);
  assert.match(source, /getMonth\(\)/);
  assert.match(source, /getDate\(\)/);
  assert.doesNotMatch(source, /toISOString\(\)\.slice\(0,\s*10\)/);
});

test("meal cache is day-aware and a failed hydrate cannot certify zero or yesterday as today", () => {
  const source = read("src/application/meals/meals-store.ts");
  assert.match(source, /cacheDayKey = localDayKey\(\)/);
  assert.match(source, /readiness: DailyDataReadiness|let readiness: DailyDataReadiness/);
  assert.match(source, /isIsoOnLocalDay\(log\.loggedAt, targetDay\)/);
  assert.match(source, /readiness = readinessFromCount\(todayLogs\.length\)/);
  assert.match(source, /catch \{[\s\S]*readiness = "UNKNOWN"/);
  assert.match(source, /meals = emptyMeals\(\)/);
  assert.match(source, /isMealCheckIn/);
});

test("water success with no logs is KNOWN_ZERO while fetch failure remains UNKNOWN", () => {
  const source = read("src/application/health/daily-tracking-store.ts");
  assert.match(source, /waterReadiness: "UNKNOWN"/);
  assert.match(source, /readinessFromCount\(todayLogs\.length\)/);
  assert.match(source, /catch \{[\s\S]*waterReadiness: "UNKNOWN"/);
  assert.doesNotMatch(source, /catch \{\s*setState\(\{ waterMl: 0 \}\)/);
});

test("water write/delete update local cache before a refresh can fail", () => {
  const source = read("src/application/health/daily-tracking-store.ts");
  assert.match(source, /setState\(\{[\s\S]*waterMl:[\s\S]*waterReadiness/);
  assert.match(source, /await trackingClient\.deleteWater\(logId\)/);
  assert.match(source, /const waterMl = Math\.max\(0, state\.waterMl - Math\.max\(0, amountMl\)\)/);
  assert.match(source, /await this\.hydrateWaterFromBackend\(\)/);
});

test("activity source is persisted entries and fetch failure is not known zero", () => {
  const source = read("src/application/health/activity-store.ts");
  assert.match(source, /activityClient\.listActivities\(startOfLocalDay\(\)\)/);
  assert.match(source, /readinessFromCount\(todayActivities\.length\)/);
  assert.match(source, /catch \{[\s\S]*setState\(\{ readiness: "UNKNOWN" \}\)/);
  assert.match(source, /Local-only until a real device\/manual step source exists\. Do not use for scoring/);
});

test("health score excludes UNKNOWN daily meal, water and activity signals", () => {
  const source = read("src/application/health/health-score.ts");
  assert.match(source, /mealsReadiness === "UNKNOWN"/);
  assert.match(source, /waterReadiness !== "UNKNOWN"/);
  assert.match(source, /activity\.readiness !== "UNKNOWN"/);
  assert.match(source, /band: "Veri bekleniyor"/);
});

test("sleep daily readiness is backed by the real daily-assessment endpoint", () => {
  const store = read("src/application/health/sleep-store.ts");
  const view = read("src/presentation/components/sleep/sleep-view.tsx");
  assert.match(store, /sleepClient\.dailyAssessment\(dayKey\)/);
  assert.match(store, /readinessFromCount\(assessment\.entries\)/);
  assert.match(store, /readiness: "UNKNOWN"/);
  assert.match(view, /Promise\.allSettled/);
  assert.match(view, /sleepStore\.markUnknown\(today\)/);
  assert.match(view, /Günlük uyku verisi doğrulanamadı/);
});

test("account switch and logout cache reset includes every audited daily source", () => {
  const source = read("src/application/health/profile-hydration.ts");
  for (const fragment of [
    "dailyTrackingStore.reset()",
    "mealsStore.reset()",
    "activityStore.reset()",
    "sleepStore.reset()",
    "weightStore.clear()",
  ]) {
    assert.ok(source.includes(fragment), fragment);
  }
});

test("daily weight task uses local calendar semantics instead of UTC date shortcut", () => {
  const source = read("src/application/health/daily-tasks.ts");
  assert.match(source, /const today = localDayKey\(\)/);
  assert.match(source, /localCalendarDayDistance\(latest\.date, today\)/);
  assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});

test("backdated weight cannot replace currentWeightKg merely because it was written later", () => {
  const persistence = read("../backend/src/modules/tracking/weight-persistence.ts");
  const integration = read("../backend/src/integration/weight-tracking.integration.test.ts");
  assert.match(persistence, /syncCurrentWeightFromHistory/);
  assert.match(persistence, /orderBy: weightLogOrderBy\(\)/);
  assert.match(integration, /afterBackdated/);
  assert.match(integration, /currentWeightKg, 69\.9/);
});

test("UNKNOWN daily activity and water are not presented to users as real zero", () => {
  const activity = read("src/presentation/components/activity/activity-view.tsx");
  const water = read("src/presentation/components/dashboard/water-section.tsx");
  assert.match(activity, /readiness === "UNKNOWN" \? "—"/);
  assert.match(activity, /Bugünkü hareket kayıtları doğrulanamadı/);
  assert.match(water, /waterReadiness === "UNKNOWN"/);
  assert.match(water, /Bugünkü su verisi doğrulanamadı/);
});
