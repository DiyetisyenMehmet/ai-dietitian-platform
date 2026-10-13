const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const helperSource = read("src/application/health/weight-utils.ts");
const viewSource = read("src/presentation/components/progress/progress-view.tsx");
const overviewSource = read("src/presentation/components/progress/progress-home-overview.tsx");
const javascript = ts.transpileModule(
  helperSource + "\nmodule.exports = { isSelectableWeightDate, formatWeightDate, recentWeightHistory, parseWeightInput };",
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const context = { module: { exports: {} }, exports: {}, Date, Intl };
vm.runInNewContext(javascript, context);
const { isSelectableWeightDate, formatWeightDate, recentWeightHistory, parseWeightInput } = context.module.exports;
const entry = (id, date, weightKg, timestamp) => ({
  id, date, weightKg, loggedAt: timestamp ?? date + "T12:00:00.000Z",
});

test("tarihler yerel takvime göre doğrulanır ve ileri tarih engellenir", () => {
  assert.equal(isSelectableWeightDate("2026-10-13", "2026-10-13"), true);
  assert.equal(isSelectableWeightDate("2026-10-14", "2026-10-13"), false);
  assert.equal(isSelectableWeightDate("2026-02-29", "2026-10-13"), false);
  assert.equal(isSelectableWeightDate("2024-02-29", "2026-10-13"), true);
  assert.equal(isSelectableWeightDate("2026-04-31", "2026-10-13"), false);
  assert.equal(isSelectableWeightDate("2026-10-2", "2026-10-13"), false);
  assert.ok(formatWeightDate("2026-10-13").includes("2026"));
});

test("kilo alanı geçerli Türkçe değerleri kabul eder, hassasiyet ve sınırı uygular", () => {
  assert.equal(parseWeightInput("68,5"), 68.5);
  assert.equal(parseWeightInput("68.5"), 68.5);
  assert.equal(parseWeightInput("25"), 25);
  assert.equal(parseWeightInput("400"), 400);
  for (const invalid of ["68,55", "24,9", "400,1", "eksi", "", "NaN"]) {
    assert.equal(parseWeightInput(invalid), null, invalid);
  }
});

test("hiç kayıt yoksa liste ve değişim üretilmez", () => {
  assert.equal(recentWeightHistory([]).length, 0);
});

test("tek kayıttan değişim hesaplanmaz", () => {
  const rows = recentWeightHistory([entry("only", "2026-10-13", 71)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].changeFromPreviousDayKg, null);
});

test("aynı gün birden fazla ölçüm, geçmişte başka gün olmadan trend oluşturmaz", () => {
  const rows = recentWeightHistory([
    entry("morning", "2026-10-13", 71.2, "2026-10-13T07:00:00Z"),
    entry("evening", "2026-10-13", 70.8, "2026-10-13T19:00:00Z"),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].entry.id, "evening");
  assert.ok(rows.every((row) => row.changeFromPreviousDayKg === null));
});

test("gerçek farklı-gün ölçümleri artışı ve azalışı tarafsız işaretle gösterir", () => {
  const rows = recentWeightHistory([
    entry("late", "2026-10-12", 72),
    entry("first", "2026-10-10", 73),
    entry("latest", "2026-10-13", 72.3),
  ]);
  assert.equal(rows[0].changeFromPreviousDayKg, 0.3);
  assert.equal(rows[1].changeFromPreviousDayKg, -1);
  assert.equal(rows[2].changeFromPreviousDayKg, null);
});

test("son dört gerçek kayıt gösterilir, diğer kayıtlar korunur", () => {
  const rows = recentWeightHistory([
    entry("a", "2026-10-01", 75),
    entry("b", "2026-10-02", 74),
    entry("c", "2026-10-03", 74.5),
    entry("d", "2026-10-04", 74),
    entry("e", "2026-10-05", 73.8),
  ]);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].entry.id, "e");
  assert.equal(rows.at(-1).entry.id, "b");
  assert.equal(rows.at(-1).changeFromPreviousDayKg, -1);
});

test("mevcut kilo kaydetme, geçmiş, analiz ve gezinme bileşenleri korunur", () => {
  assert.match(viewSource, /weightStore\.add\(kg, undefined, date\)/);
  assert.match(viewSource, /journeyStore\.hydrateJourneyFromBackend\(\)/);
  assert.match(viewSource, /<ProgressStatsSection \/>/);
  assert.match(viewSource, /href="\/history"/);
  assert.match(viewSource, /recentWeightHistory\(entries, 4\)/);
  assert.match(viewSource, /isSelectableWeightDate\(date\)/);
  assert.match(overviewSource, /href="#weight-measurements"/);
});

test("kilo ve hedef bilgileri korunaklı ve küçük ekranlarda sığabilir", () => {
  assert.match(overviewSource, /validGoal\(profile\.targetWeightKg\)/);
  assert.match(overviewSource, /analysis\.status !== "no-data"/);
  assert.match(overviewSource, /flex flex-wrap items-start gap-3/);
  assert.match(overviewSource, /sm:w-auto sm:shrink-0/);
});
