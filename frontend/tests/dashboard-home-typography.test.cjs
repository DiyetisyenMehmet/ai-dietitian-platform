const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

test("home metrics, actions and header retain the approved compact staging typography", () => {
  const metrics = read("src/presentation/components/dashboard/dashboard-metrics-section.tsx");
  const quick = read("src/presentation/components/dashboard/dashboard-quick-actions.tsx");
  const quickRegistry = read(
    "src/presentation/components/dashboard/dashboard-quick-action-registry.tsx",
  );
  const dashboardPreferences = read(
    "src/domain/account/dashboard-card-preferences.ts",
  );
  const view = read("src/presentation/components/dashboard/dashboard-view.tsx");
  const header = read("src/presentation/components/dashboard/dashboard-home-header.tsx");

  // Staging already reduced the metric and action typography. Keep that
  // approved contract instead of requiring the superseded large sizes.
  assert.match(metrics, /text-\[13px\]/);
  assert.match(metrics, /text-\[10\.5px\]/);
  assert.match(quick, /text-\[16px\]/);
  assert.match(quick, /text-\[12px\]/);
  assert.match(quick, /data-quick-action-layout="equal-flex"/);
  assert.match(quick, /data-max-actions="5"/);
  assert.match(
    dashboardPreferences,
    /DEFAULT_DASHBOARD_QUICK_ACTION_ORDER = \[\s*"meal",\s*"water",\s*"activity",\s*"weight",\s*\]/,
  );
  for (const id of ["meal", "water", "activity", "weight"]) {
    assert.match(quickRegistry, new RegExp(`id: "${id}"`));
  }
  assert.doesNotMatch(quickRegistry, /id: "sleep"/);
  assert.match(quick, /whitespace-nowrap/);
  assert.match(view, /text-lg font-semibold text-muted-foreground/);
  assert.match(header, /text-\[28px\]/);
});
