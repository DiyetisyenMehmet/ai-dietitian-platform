const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const overview = fs.readFileSync(path.join(root, "src/presentation/components/progress/progress-home-overview.tsx"), "utf8");
const view = fs.readFileSync(path.join(root, "src/presentation/components/progress/progress-view.tsx"), "utf8");
const page = fs.readFileSync(path.join(root, "src/app/progress/page.tsx"), "utf8");
const stats = fs.readFileSync(path.join(root, "src/presentation/components/progress/progress-stats-section.tsx"), "utf8");

const from = overview.indexOf("export type ProgressPeriod");
const to = overview.indexOf("\ntype TrendPoint =", from);
assert.ok(from >= 0 && to > from, "Production period filter is available");
const isolated = overview.slice(from, to);
const transpiled = ts.transpileModule(
  "const localDateKey = (date = new Date('2026-10-12T12:00:00')) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');\nconst dateKeyToLocalNoon = (key) => new Date(key + 'T12:00:00');\n" +
    isolated + "\nmodule.exports = { weightEntriesForPeriod, PERIODS };",
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;
const sandbox = { module: { exports: {} }, exports: {}, Date };
vm.runInNewContext(transpiled, sandbox);
const { weightEntriesForPeriod, PERIODS } = sandbox.module.exports;
const measurements = [
  { id: "a", date: "2026-07-01", weightKg: 75 },
  { id: "b", date: "2026-09-11", weightKg: 72 },
  { id: "c", date: "2026-10-06", weightKg: 71 },
  { id: "d", date: "2026-10-12", weightKg: 70 },
];
const ids = (entries) => Array.from(entries, (entry) => entry.id);

test("Dört dönem seçeneği benzersiz ve işlevsel", () => {
  assert.deepEqual(Array.from(PERIODS, (period) => period.value), ["week", "month", "quarter", "all"]);
});

test("Haftalık yalnız son 7 takvim gününü gösterir", () => {
  assert.deepEqual(ids(weightEntriesForPeriod(measurements, "week")), ["c", "d"]);
});

test("Aylık ve üç aylık pencereler kayıt tarihine göre ayrılır", () => {
  assert.deepEqual(ids(weightEntriesForPeriod(measurements, "month")), ["c", "d"]);
  assert.deepEqual(ids(weightEntriesForPeriod(measurements, "quarter")), ["b", "c", "d"]);
});

test("Tümü seçeneği gerçek kayıtları saklamaz veya yeniden üretmez", () => {
  assert.deepEqual(ids(weightEntriesForPeriod(measurements, "all")), ["a", "b", "c", "d"]);
});

test("Kayıt olmayan dönemde sahte nokta oluşturulmaz", () => {
  assert.equal(weightEntriesForPeriod([{ id: "x", date: "2026-01-01", weightKg: 80 }], "week").length, 0);
});

test("Hedef ve kayıt geçerlilik koşulları korunur", () => {
  assert.match(overview, /analysis\.status !== "no-data" && target !== null/);
  assert.match(overview, /daily\.waterReadiness !== "UNKNOWN"/);
  assert.match(overview, /activity\.readiness !== "UNKNOWN"/);
  assert.match(overview, /mealsReadiness !== "UNKNOWN"/);
  assert.match(overview, /!calorieMissing/);
  assert.match(stats, /hasConfiguredGoal && hasComparableDays/);
});

test("Mevcut kilo kaydı, geçmiş ve alt gezinme yolları korunur", () => {
  assert.match(view, /weightStore\.add\(kg/);
  assert.match(view, /journeyStore\.hydrateJourneyFromBackend\(\)/);
  assert.match(view, /href="\/history"/);
  assert.match(page, /<AppShell title="İlerleme" hideHeader>/);
  assert.doesNotMatch(page, /hideBottomNav/);
});

test("Su, aktivite ve beslenme grafikleri yalnız gerçek kaynakları kullanır", () => {
  assert.match(overview, /trackingClient\.listWater\(since\)/);
  assert.match(overview, /activityClient\.listActivities\(since\)/);
  assert.match(overview, /computeTotals\(meals\)/);
  assert.doesNotMatch(overview, /\[0\.4, 0\.65, 0\.9/);
});
