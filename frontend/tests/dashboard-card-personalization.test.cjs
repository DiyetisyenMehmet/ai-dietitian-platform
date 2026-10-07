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

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("new users receive default cards and the four real quick actions", () => {
  const {
    DEFAULT_DASHBOARD_CARD_ORDER,
    DEFAULT_DASHBOARD_QUICK_ACTION_ORDER,
    normalizeDashboardCardPreferences,
    visibleDashboardCardIds,
    visibleDashboardQuickActionIds,
  } = load();
  const result = normalizeDashboardCardPreferences({
    order: [],
    hidden: [],
    quickActionOrder: [],
    hiddenQuickActionIds: [],
  });

  assert.deepEqual(plain(result.order), Array.from(DEFAULT_DASHBOARD_CARD_ORDER));
  assert.deepEqual(
    plain(result.quickActionOrder),
    Array.from(DEFAULT_DASHBOARD_QUICK_ACTION_ORDER),
  );
  assert.deepEqual(plain(visibleDashboardCardIds(result)), Array.from(DEFAULT_DASHBOARD_CARD_ORDER));
  assert.deepEqual(
    plain(visibleDashboardQuickActionIds(result)),
    Array.from(DEFAULT_DASHBOARD_QUICK_ACTION_ORDER),
  );
});

test("unknown and duplicate card or quick-action ids normalize safely", () => {
  const { normalizeDashboardCardPreferences } = load();
  const result = normalizeDashboardCardPreferences({
    order: ["progress", "unknown-card", "progress", "food"],
    hidden: ["unknown-card", "blood", "blood"],
    quickActionOrder: ["weight", "fake-action", "weight", "meal"],
    hiddenQuickActionIds: ["fake-action", "water", "water"],
  });

  assert.deepEqual(plain(result.order), ["blood", "progress", "food", "coach"]);
  assert.deepEqual(plain(result.hidden), ["blood"]);
  assert.deepEqual(plain(result.quickActionOrder), ["water", "activity", "weight", "meal"]);
  assert.deepEqual(plain(result.hiddenQuickActionIds), ["water"]);
});

test("corrupt stored state cannot reduce cards or quick actions below three", () => {
  const {
    MIN_VISIBLE_DASHBOARD_CARDS,
    MIN_VISIBLE_DASHBOARD_QUICK_ACTIONS,
    normalizeDashboardCardPreferences,
    visibleDashboardCardIds,
    visibleDashboardQuickActionIds,
  } = load();
  const result = normalizeDashboardCardPreferences({
    order: ["food", "blood", "progress", "coach"],
    hidden: ["food", "blood", "progress", "coach"],
    quickActionOrder: ["meal", "water", "activity", "weight"],
    hiddenQuickActionIds: ["meal", "water", "activity", "weight"],
  });

  assert.equal(visibleDashboardCardIds(result).length, MIN_VISIBLE_DASHBOARD_CARDS);
  assert.equal(
    visibleDashboardQuickActionIds(result).length,
    MIN_VISIBLE_DASHBOARD_QUICK_ACTIONS,
  );
});

test("generic normalization inserts new registry ids and enforces quick-action max five", () => {
  const { normalizeDashboardPreferenceIds } = load();
  const result = normalizeDashboardPreferenceIds(
    ["meal", "water", "activity"],
    [],
    ["meal", "water", "activity", "weight", "future_a", "future_b"],
    3,
    5,
  );

  assert.equal(result.order.length, 6);
  assert.equal(new Set(result.order).size, 6);
  assert.equal(result.order.includes("future_a"), true);
  assert.equal(result.order.includes("future_b"), true);
  assert.equal(result.order.filter((id) => !result.hidden.includes(id)).length, 5);
});

test("card and quick-action reorder preserve hidden positions", () => {
  const {
    normalizeDashboardCardPreferences,
    reorderVisibleDashboardCards,
    reorderVisibleDashboardQuickActions,
    visibleDashboardCardIds,
    visibleDashboardQuickActionIds,
  } = load();
  const start = normalizeDashboardCardPreferences({
    order: ["food", "blood", "progress", "coach"],
    hidden: ["blood"],
    quickActionOrder: ["meal", "water", "activity", "weight"],
    hiddenQuickActionIds: ["water"],
  });

  const cards = reorderVisibleDashboardCards(start, ["coach", "food", "progress"]);
  assert.deepEqual(plain(cards.order), ["coach", "blood", "food", "progress"]);
  assert.deepEqual(plain(visibleDashboardCardIds(cards)), ["coach", "food", "progress"]);

  const actions = reorderVisibleDashboardQuickActions(cards, ["weight", "meal", "activity"]);
  assert.deepEqual(plain(actions.quickActionOrder), ["weight", "water", "meal", "activity"]);
  assert.deepEqual(plain(visibleDashboardQuickActionIds(actions)), ["weight", "meal", "activity"]);
});

test("hide enforces minimum three and restore uses stored order for both groups", () => {
  const {
    normalizeDashboardCardPreferences,
    hideDashboardCard,
    hideDashboardQuickAction,
    showDashboardCard,
    showDashboardQuickAction,
    visibleDashboardCardIds,
    visibleDashboardQuickActionIds,
  } = load();
  const start = normalizeDashboardCardPreferences({
    order: ["blood", "food", "progress", "coach"],
    hidden: [],
    quickActionOrder: ["weight", "meal", "water", "activity"],
    hiddenQuickActionIds: [],
  });

  const cardHidden = hideDashboardCard(start, "food");
  assert.equal(cardHidden.changed, true);
  assert.equal(hideDashboardCard(cardHidden.preferences, "blood").changed, false);
  assert.deepEqual(
    plain(visibleDashboardCardIds(showDashboardCard(cardHidden.preferences, "food"))),
    ["blood", "food", "progress", "coach"],
  );

  const actionHidden = hideDashboardQuickAction(start, "meal");
  assert.equal(actionHidden.changed, true);
  assert.equal(hideDashboardQuickAction(actionHidden.preferences, "weight").changed, false);
  assert.deepEqual(
    plain(visibleDashboardQuickActionIds(showDashboardQuickAction(actionHidden.preferences, "meal"))),
    ["weight", "meal", "water", "activity"],
  );
});

test("inline personalization source removes the old editor modal and visible move arrows", () => {
  const view = read("src/presentation/components/dashboard/dashboard-view.tsx");
  const cards = read("src/presentation/components/dashboard/dashboard-personalized-cards.tsx");
  const section = read("src/presentation/components/dashboard/dashboard-personalization-section.tsx");
  const quick = read("src/presentation/components/dashboard/dashboard-quick-actions.tsx");

  assert.match(view, /<DashboardPersonalizationSection \/>/);
  assert.doesNotMatch(view, /<DashboardQuickActions \/>|<DashboardPersonalizedCards \/>/);
  assert.doesNotMatch(cards, /ArrowUp|ArrowDown|ModalContent|Ana ekran kartları/);
  assert.match(cards, /data-dashboard-card-drag-handle/);
  assert.match(cards, /data-dashboard-card-drag-surface/);
  assert.match(cards, /EllipsisVertical/);
  assert.doesNotMatch(cards, /GripVertical/);
  assert.match(quick, /data-dashboard-edit-toggle/);
  assert.match(quick, /data-quick-action-drag-surface/);
  assert.match(quick, /EllipsisVertical/);
  assert.doesNotMatch(quick, /GripVertical/);
  assert.doesNotMatch(quick, />Düzenle</);
  assert.match(section, /Kartları basılı tutup sıralayabilirsin./);
  assert.match(section, /Kaydet/);
  assert.match(section, /Gizlenenleri Gör/);
  assert.match(section, /role="tablist"/);
  assert.match(section, /Kartlar/);
  assert.match(section, /Hızlı İşlemler/);
  assert.match(section, /Varsayılana Dön/);
  assert.doesNotMatch(section, /Haftalık Özetim|Beslenme Planım/);
});

test("only the four real quick actions exist in the registry", () => {
  const registry = read("src/presentation/components/dashboard/dashboard-quick-action-registry.tsx");
  for (const id of ["meal", "water", "activity", "weight"]) {
    assert.match(registry, new RegExp(`id: "${id}"`));
  }
  assert.doesNotMatch(registry, /sleep|barcode|photo|blood|plan/);
});

test("feature card source components keep approved fixed geometry contracts", () => {
  const live = read("src/presentation/components/dashboard/dashboard-live-feature-card.tsx");
  const blood = read("src/presentation/components/dashboard/blood-test-card.tsx");
  const coach = read("src/presentation/components/dashboard/dashboard-ai-banner.tsx");
  assert.match(live, /data-dashboard-fixed-geometry/);
  assert.match(live, /data-frame-aspect="21:5"/);
  assert.match(blood, /data-dashboard-fixed-geometry/);
  assert.match(blood, /data-frame-aspect="21:5"/);
  assert.match(coach, /data-dashboard-fixed-geometry/);
  assert.match(coach, /aspectRatio: "670 \/ 126"/);
});


test("dashboard home compact refinement keeps the approved scope and geometry", () => {
  const header = read("src/presentation/components/dashboard/dashboard-home-header.tsx");
  const journey = read("src/presentation/components/dashboard/daily-journey-section.tsx");
  const metrics = read("src/presentation/components/dashboard/dashboard-metrics-section.tsx");
  const quick = read("src/presentation/components/dashboard/dashboard-quick-actions.tsx");
  const view = read("src/presentation/components/dashboard/dashboard-view.tsx");

  assert.match(header, /data-dashboard-home-header/);
  assert.match(header, /data-dashboard-header-info/);
  assert.match(header, /text-\[24px\].*sm:text-\[30px\]/);
  assert.match(header, /text-\[10px\].*text-muted-foreground\/55/);

  assert.match(journey, /data-journey-card-heading/);
  assert.match(journey, /<h3 className="min-w-0 text-base font-semibold leading-tight">/);
  assert.match(journey, /\$\{completed\}\/\$\{total\} adım/);
  assert.doesNotMatch(journey, /Günlük yolculuğun/);

  assert.match(metrics, /data-dashboard-metrics/);
  assert.match(metrics, /max-w-\[74px\].*sm:max-w-\[94px\]/);
  assert.match(metrics, /px-2\.5 py-3.*sm:px-4 sm:py-3\.5/);

  assert.match(quick, /text-\[19px\] font-bold leading-tight sm:text-xl/);
  assert.match(quick, /flex size-10 shrink-0 items-center justify-center rounded-full/);
  assert.match(quick, /SlidersHorizontal className="size-\[18px\]"/);

  assert.match(view, /data-daily-journey-section\]\]:!mt-2\.5/);
  assert.match(view, /data-dashboard-personalization\]\]:!mt-2\.5/);
});
