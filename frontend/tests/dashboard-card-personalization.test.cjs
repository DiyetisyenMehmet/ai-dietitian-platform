const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load() {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/domain/account/dashboard-card-preferences.ts"),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console });
  return exports;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("new users receive the system default Dashboard card order", () => {
  const {
    DEFAULT_DASHBOARD_CARD_ORDER,
    normalizeDashboardCardPreferences,
    visibleDashboardCardIds,
  } = load();
  const result = normalizeDashboardCardPreferences({ order: [], hidden: [] });
  assert.deepEqual(plain(result.order), Array.from(DEFAULT_DASHBOARD_CARD_ORDER));
  assert.deepEqual(plain(visibleDashboardCardIds(result)), Array.from(DEFAULT_DASHBOARD_CARD_ORDER));
});

test("unknown and duplicate ids are ignored without breaking the Dashboard", () => {
  const { normalizeDashboardCardPreferences } = load();
  const result = normalizeDashboardCardPreferences({
    order: ["progress", "unknown-card", "progress", "food"],
    hidden: ["unknown-card", "blood", "blood"],
  });
  assert.deepEqual(plain(result.order), ["blood", "progress", "food", "coach"]);
  assert.deepEqual(plain(result.hidden), ["blood"]);
});

test("corrupt hidden state is normalized back to at least three visible cards", () => {
  const {
    normalizeDashboardCardPreferences,
    visibleDashboardCardIds,
    MIN_VISIBLE_DASHBOARD_CARDS,
  } = load();
  const result = normalizeDashboardCardPreferences({
    order: ["food", "blood", "progress", "coach"],
    hidden: ["food", "blood", "progress", "coach"],
  });
  assert.equal(visibleDashboardCardIds(result).length, MIN_VISIBLE_DASHBOARD_CARDS);
});

test("a future registry card missing from an old preference is inserted safely", () => {
  const { normalizeDashboardCardPreferenceIds } = load();
  const result = normalizeDashboardCardPreferenceIds(
    {
      order: ["progress", "food", "coach"],
      hidden: [],
    },
    ["food", "blood", "progress", "coach", "future_card"],
    3,
  );
  assert.equal(result.order.includes("blood"), true);
  assert.equal(result.order.includes("future_card"), true);
  assert.equal(new Set(result.order).size, 5);
});

test("reorder changes visible order while preserving hidden card positions", () => {
  const {
    normalizeDashboardCardPreferences,
    reorderVisibleDashboardCards,
    visibleDashboardCardIds,
  } = load();
  const start = normalizeDashboardCardPreferences({
    order: ["food", "blood", "progress", "coach"],
    hidden: ["blood"],
  });
  const next = reorderVisibleDashboardCards(start, ["coach", "food", "progress"]);
  assert.deepEqual(plain(next.order), ["coach", "blood", "food", "progress"]);
  assert.deepEqual(plain(next.hidden), ["blood"]);
  assert.deepEqual(plain(visibleDashboardCardIds(next)), ["coach", "food", "progress"]);
});

test("hide enforces minimum three and restore returns a card to its saved order", () => {
  const {
    normalizeDashboardCardPreferences,
    hideDashboardCard,
    showDashboardCard,
    visibleDashboardCardIds,
  } = load();
  const start = normalizeDashboardCardPreferences({
    order: ["blood", "food", "progress", "coach"],
    hidden: [],
  });
  const hidden = hideDashboardCard(start, "food");
  assert.equal(hidden.changed, true);
  assert.deepEqual(plain(visibleDashboardCardIds(hidden.preferences)), ["blood", "progress", "coach"]);

  const rejected = hideDashboardCard(hidden.preferences, "blood");
  assert.equal(rejected.changed, false);
  assert.deepEqual(
    plain(visibleDashboardCardIds(rejected.preferences)),
    ["blood", "progress", "coach"],
  );

  const restored = showDashboardCard(hidden.preferences, "food");
  assert.deepEqual(plain(visibleDashboardCardIds(restored)), ["blood", "food", "progress", "coach"]);
});

test("feature card source components keep their existing fixed geometry contracts", () => {
  const live = fs.readFileSync(
    path.join(__dirname, "../src/presentation/components/dashboard/dashboard-live-feature-card.tsx"),
    "utf8",
  );
  const blood = fs.readFileSync(
    path.join(__dirname, "../src/presentation/components/dashboard/blood-test-card.tsx"),
    "utf8",
  );
  const coach = fs.readFileSync(
    path.join(__dirname, "../src/presentation/components/dashboard/dashboard-ai-banner.tsx"),
    "utf8",
  );
  assert.match(live, /data-dashboard-fixed-geometry/);
  assert.match(live, /data-frame-aspect="21:5"/);
  assert.match(blood, /data-dashboard-fixed-geometry/);
  assert.match(blood, /data-frame-aspect="21:5"/);
  assert.match(coach, /data-dashboard-fixed-geometry/);
  assert.match(coach, /aspectRatio: "670 \/ 126"/);
});
