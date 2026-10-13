const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/application/meals/package-consumption.ts"), "utf8");
const scanUI = fs.readFileSync(path.join(root, "src/presentation/components/meals/barcode-scanner-panel.tsx"), "utf8");
const api = fs.readFileSync(path.join(root, "src/infrastructure/nutrition/nutrition-client.ts"), "utf8");
const js = ts.transpileModule(source + "\nmodule.exports = { parsePackageSize, nutrientsForAmount, volumeReference, mineralMgForVolume };",
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sandbox = { module: { exports: {} }, exports: {}, Number, Math, Object };
vm.runInNewContext(js, sandbox);
const { parsePackageSize, nutrientsForAmount, volumeReference, mineralMgForVolume } = sandbox.module.exports;
const nutrients = (overrides = {}) => ({
  energyKcal: null, proteinG: null, carbohydratesG: null, fatG: null,
  saturatedFatG: null, sugarsG: null, fiberG: null, sodiumMg: null, saltG: null,
  ...overrides,
});
const food = ({ quantity, basis = "PER_100_G", serving = null, per100 = nutrients(),
  perServing = null } = {}) => ({
  quantity, provenance: { dataBasis: basis }, serving,
  nutrientsPer100g: per100, nutrientsPerServing: perServing,
});

test("200 ml beverage uses volume and not grams", () => {
  assert.deepEqual({ ...parsePackageSize("200 ml") }, { amount: 200, unit: "ml" });
  assert.deepEqual({ ...parsePackageSize("0,2 L") }, { amount: 200, unit: "ml" });
  assert.deepEqual({ ...parsePackageSize("2 x 200 ml") }, { amount: 400, unit: "ml" });
});
test("ambiguous package sizes are rejected", () => {
  for (const v of ["200", "200 ml + 50 ml", "yaklaşık 200 ml", "1 şişe", "200ml/100g", null]) {
    assert.equal(parsePackageSize(v), null, String(v));
  }
});
test("100g never becomes 100ml without a matching reference", () => {
  const bottle = food({ quantity: "200 ml", per100: nutrients({ energyKcal: 0, sodiumMg: 20 }) });
  assert.equal(nutrientsForAmount(bottle, 200, "ml"), null);
  assert.equal(nutrientsForAmount(bottle, 200, "g").energyKcal, 0);
});
test("Beypazari 200ml and half bottle scale only explicit 200ml source values", () => {
  const bottle = food({
    quantity: "200 ml",
    serving: { amount: 200, unit: "ml", gramWeight: null, description: "200 ml" },
    perServing: nutrients({ energyKcal: 0, sodiumMg: 40, micronutrients: { calcium: 24, magnesium: null } }),
  });
  assert.equal(volumeReference(bottle).amount, 200);
  assert.equal(nutrientsForAmount(bottle, 200, "ml").sodiumMg, 40);
  assert.equal(nutrientsForAmount(bottle, 100, "ml").sodiumMg, 20);
  assert.equal(nutrientsForAmount(bottle, 100, "ml").micronutrients.calcium, 12);
  assert.equal(nutrientsForAmount(bottle, 100, "ml").micronutrients.magnesium, null);
});
test("mg/L mineral concentration converts to actual consumed volume", () => {
  assert.equal(mineralMgForVolume(400, 200), 80);
  assert.equal(mineralMgForVolume(400, 100), 40);
  assert.equal(mineralMgForVolume(null, 200), null);
  assert.equal(mineralMgForVolume(400, 0), null);
});
test("50g snack one package and half package work without mandatory gram input", () => {
  const snack = food({ quantity: "50 g", per100: nutrients({ energyKcal: 500, proteinG: 10 }) });
  const pack = parsePackageSize(snack.quantity);
  assert.deepEqual({ ...pack }, { amount: 50, unit: "g" });
  assert.equal(nutrientsForAmount(snack, pack.amount, pack.unit).energyKcal, 250);
  assert.equal(nutrientsForAmount(snack, 25, pack.unit).proteinG, 2.5);
});
test("missing nutrients remain null", () => {
  const snack = food({ quantity: "25 g", per100: nutrients({ energyKcal: 60 }) });
  const value = nutrientsForAmount(snack, 25, "g");
  assert.equal(value.energyKcal, 15);
  assert.equal(value.proteinG, null);
  assert.equal(value.sodiumMg, null);
});
test("source per-serving gram reference is not confused with 100g", () => {
  const packed = food({
    quantity: "60 g", basis: "PER_SERVING",
    serving: { amount: 30, unit: "g", gramWeight: 30, description: "30 g" },
    per100: nutrients({ energyKcal: null }), perServing: nutrients({ energyKcal: 120 }),
  });
  assert.equal(nutrientsForAmount(packed, 60, "g").energyKcal, 240);
});
test("inspection hides consumption selector until the add action", () => {
  assert.match(scanUI, /!consumptionOpen && \(/);
  assert.match(scanUI, /consumptionOpen && \(/);
  assert.match(scanUI, /Öğüne eklemek için porsiyon seç/);
  assert.match(scanUI, /Yarım paket/);
  assert.match(scanUI, /Mililitre \(ml\)/);
  assert.match(scanUI, /selectedConsumption\?\.unit !== "g"/);
});
test("meal API preserves ml and uses explicit-source nutrients", () => {
  assert.match(api, /consumedAmount: consumption\.amount/);
  assert.match(api, /consumedUnit: consumption\.unit/);
  assert.match(scanUI, /personalizeNutrients\(nutrients\)/);
  assert.match(scanUI, /nutritionClient\.logMeal\(mealType, food, personalization, selectedConsumption\)/);
});
