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


test("dashboard home retains approved header, metrics and quick actions around Journey Pro", () => {
  const header = read("src/presentation/components/dashboard/dashboard-home-header.tsx");
  const journey = read("src/presentation/components/dashboard/daily-journey-section.tsx");
  const metrics = read("src/presentation/components/dashboard/dashboard-metrics-section.tsx");
  const quick = read("src/presentation/components/dashboard/dashboard-quick-actions.tsx");
  const view = read("src/presentation/components/dashboard/dashboard-view.tsx");

  assert.match(header, /data-dashboard-home-header/);
  assert.match(header, /data-dashboard-header-info/);
  assert.match(header, /data-dashboard-greeting/);
  assert.match(header, /normalizedName \? normalizedName\.split\(\/\\s\+\/\)\[0\] : "Diewish"/);
  assert.match(header, /whitespace-nowrap py-0\.5.*text-\[16px\].*min-\[360px\]:text-\[19px\].*min-\[400px\]:text-\[20px\].*min-\[430px\]:text-\[21px\].*sm:text-\[28px\]/);
  assert.match(header, /data-dashboard-greeting-emoji/);
  // Only the greeting is bounded; an unbroken first name must not enlarge the mobile viewport.
  assert.match(header, /<h1 className="min-w-0 flex-1 overflow-hidden text-ellipsis/);
  assert.match(header, /data-dashboard-header-actions/);
  assert.match(header, /flex size-9.*sm:size-10/);
  assert.match(header, /Bell className="size-4"/);
  assert.match(header, /min-w-4\.5.*text-\[10px\]/);
  assert.doesNotMatch(header, /UserRound|href="\/profile"|Profilini aç/);
  assert.match(header, /text-\[9px\].*text-muted-foreground\/55/);

  // PR #115's approved expanded composition supersedes the compact CSS contract.
  // Keep real progress, 48px actions (above the 44px minimum) and next/plan sections.
  assert.match(journey, /data-journey-card-heading/);
  assert.match(journey, /<h3 className="min-w-0 flex-1 text-base font-semibold tracking-tight sm:text-lg">/);
  assert.match(journey, /\$\{completed\}\/\$\{total\} adım/);
  assert.match(journey, /const \{ completed, total, percent \} = summarizeJourney\(steps\)/);
  assert.match(journey, /<ProgressBar\s+value=\{percent\}/);
  assert.match(journey, /space-y-4 p-4 sm:p-5/);
  assert.match(journey, /min-h-12 min-w-11/);
  assert.match(journey, /<div data-journey-row className="flex min-w-0 items-center gap-3 py-2\.5">/);
  assert.match(journey, /data-journey-next/);
  assert.match(journey, /data-journey-focus-card/);
  assert.match(journey, /data-journey-plan-meal/);
  assert.match(journey, /<div className="grid grid-cols-2 gap-2" data-journey-meal-actions>/);
  assert.match(journey, /const \[expanded, setExpanded\] = React\.useState\(true\)/);
  assert.match(journey, /data-journey-timeline-step data-step-state=\{step\.state\}/);
  assert.match(journey, /data-journey-plan-fallback/);
  assert.equal((view.match(/<DailyJourneySection\s*\/>/g) ?? []).length, 1);
  assert.doesNotMatch(journey, /Günlük yolculuğun/);

  assert.match(metrics, /data-dashboard-metrics/);
  assert.match(metrics, /max-w-\[62px\].*sm:max-w-\[80px\]/);
  assert.match(metrics, /px-2 py-2.*sm:px-3 sm:py-2\.5/);
  assert.match(metrics, /flex min-w-0 h-full flex-col items-center text-center/);

  assert.match(quick, /text-\[16px\] font-semibold leading-tight sm:text-lg/);
  assert.match(quick, /min-h-\[72px\].*sm:min-h-20/);
  assert.match(quick, /flex size-10 shrink-0 items-center justify-center rounded-full/);
  assert.match(quick, /flex size-8 items-center justify-center rounded-full border/);
  assert.match(quick, /SlidersHorizontal className="size-\[15px\]"/);

  assert.match(view, /data-daily-journey-section\]\]:!mt-1\.5/);
  assert.match(view, /data-dashboard-personalization\]\]:!mt-1\.5/);
});
