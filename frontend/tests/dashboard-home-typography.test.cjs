const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

test("home metrics, actions and header retain their established typography", () => {
  const metrics = read("src/presentation/components/dashboard/dashboard-metrics-section.tsx");
  const quick = read("src/presentation/components/dashboard/dashboard-quick-actions.tsx");
  const view = read("src/presentation/components/dashboard/dashboard-view.tsx");
  const header = read("src/presentation/components/dashboard/dashboard-home-header.tsx");

  assert.match(metrics, /text-\[16px\]/);
  assert.match(metrics, /text-\[13px\]/);
  assert.match(quick, /text-\[22px\]/);
  assert.match(quick, /text-\[12px\]/);
  assert.match(quick, /data-quick-action-layout="equal-flex"/);
  assert.match(quick, /data-max-actions="5"/);
  assert.match(quick, /SHOW_SLEEP_QUICK_ACTION = false/);
  assert.match(quick, /whitespace-nowrap/);
  assert.match(view, /text-lg font-semibold text-muted-foreground/);
  assert.match(header, /text-\[28px\]/);
});
