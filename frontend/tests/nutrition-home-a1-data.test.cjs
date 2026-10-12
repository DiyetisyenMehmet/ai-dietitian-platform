const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const storeSource = fs.readFileSync(
  path.join(root, "src/application/meals/meals-store.ts"), "utf8",
);
const pageSource = fs.readFileSync(
  path.join(root, "src/app/meals/page.tsx"), "utf8",
);
const summarySource = fs.readFileSync(
  path.join(root, "src/presentation/components/meals/nutrition-summary.tsx"), "utf8",
);

function between(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  assert.ok(from !== -1 && to > from, "Production function could not be found");
  return text.slice(from, to);
}

const productionHelpers = [
  between(storeSource, "function isMissingAmount(", "\nlet meals:"),
  between(storeSource, "export function findMissingNutrition(", "\nexport function computeTotals("),
].join("\n\n");

const js = ts.transpileModule(
  productionHelpers + "\nmodule.exports = { isMissingAmount, amountOrZero, toFoodItem, findMissingNutrition };",
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;
const context = { module: { exports: {} }, exports: {} };
vm.runInNewContext(js, context);
const { toFoodItem, findMissingNutrition } = context.module.exports;

function log(patch = {}) {
  return {
    id: "test-food", name: "Test besini", calories: 0, proteinG: 0,
    carbsG: 0, fatG: 0, ...patch,
  };
}

test("API'den gelen null besin değerleri eksik kalır, sıfır olarak sunulmaz", () => {
  const food = toFoodItem(log({ calories: null, proteinG: null, carbsG: null, fatG: null }));
  assert.equal(food.calories, 0); // legacy arithmetic placeholder
  assert.equal(food.missingNutrition.calories, true);
  assert.equal(food.missingNutrition.protein, true);
  assert.equal(food.missingNutrition.carbs, true);
  assert.equal(food.missingNutrition.fat, true);
});

test("API'den gelen gerçek sıfır eksik veri sayılmaz", () => {
  const food = toFoodItem(log());
  for (const key of ["calories", "protein", "carbs", "fat"]) {
    assert.equal(food[key], 0);
    assert.equal(food.missingNutrition[key], false);
  }
});

test("Eksik alanlar toplam tamamlık bilgisini etkiler, diğer makroları etkilemez", () => {
  const partial = toFoodItem(log({ calories: null, proteinG: 17, carbsG: 0, fatG: 2 }));
  const complete = toFoodItem(log({ id: "second", calories: 350, proteinG: 22, carbsG: 12, fatG: 10 }));
  const flags = findMissingNutrition([{ foods: [partial, complete] }]);
  assert.equal(flags.calories, true);
  assert.equal(flags.protein, false);
  assert.equal(flags.carbs, false);
  assert.equal(flags.fat, false);
});

test("NaN, sonsuz ve negatif miktarlar bilinen sıfır olarak gösterilmez", () => {
  const food = toFoodItem(log({ calories: NaN, proteinG: Infinity, carbsG: -1 }));
  assert.equal(food.missingNutrition.calories, true);
  assert.equal(food.missingNutrition.protein, true);
  assert.equal(food.missingNutrition.carbs, true);
  assert.equal(food.fat, 0);
  assert.equal(food.missingNutrition.fat, false);
});

test("Hiç besin yokken ve değer eksikken hedef yüzdesi gösterilmez", () => {
  assert.match(pageSource, /hasLoggedFoods=\{totalFoods > 0\}/);
  assert.match(summarySource, /known && hasLoggedFoods && !missingNutrition\.calories/);
  assert.match(summarySource, /known && hasLoggedFoods && !missingNutrition\[key\]/);
});

test("Beş filtre gerçek dört öğün alanına bağlıdır", () => {
  for (const slot of ['"breakfast"', '"lunch"', '"dinner"', '"snack"']) {
    assert.ok(pageSource.includes("value: " + slot));
  }
  assert.match(pageSource, /meals\.filter\(\(meal\) => meal\.slot === filter\)/);
});
