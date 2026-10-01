import assert from "node:assert/strict";
import test from "node:test";

import {
  allergenDataNotice,
  comparisonNutritionText,
  novaText,
  nutriScoreText,
  partialProductDataNotice,
  productInfoRows,
  type ProductDisplayFood,
} from "./product-data-display";

function food(overrides: Partial<ProductDisplayFood> = {}): ProductDisplayFood {
  return {
    brand: null,
    ingredients: [],
    allergens: [],
    additives: [],
    vegan: null,
    vegetarian: null,
    glutenFree: null,
    nutriScore: null,
    novaGroup: null,
    ...overrides,
  };
}

test("missing Nutri-Score and NOVA use natural text instead of technical UNKNOWN", () => {
  assert.equal(nutriScoreText(null), "Nutri-Score bilgisi yok");
  assert.equal(nutriScoreText("unknown"), "Nutri-Score bilgisi yok");
  assert.equal(novaText(null), "NOVA bilgisi yok");
  assert.equal(novaText(0), "NOVA bilgisi yok");
});

test("verified Nutri-Score and NOVA stay visible", () => {
  assert.equal(nutriScoreText("b"), "B");
  assert.equal(novaText(4), "4");
});

test("optional missing catalog and boolean fields are omitted instead of repeating placeholders", () => {
  const rows = productInfoRows(food());
  const labels = rows.map(([label]) => label);
  assert.deepEqual(labels, ["Nutri-Score", "NOVA", "İçerik", "Katkı maddeleri"]);
  assert.equal(rows.some(([, value]) => /Bilgi bulunamadı|UNKNOWN|null|undefined/.test(value)), false);
});

test("incomplete allergen evidence stays visibly conservative", () => {
  assert.match(allergenDataNotice(food()) ?? "", /Alerjen bilgisi yeterli değil/);
});

test("complete empty allergen declaration is not presented as missing", () => {
  const complete = food({
    allergenEvidence: {
      ingredientList: "DECLARED",
      allergenDeclaration: "DECLARED",
      crossContaminationWarnings: [],
    },
  });
  assert.equal(allergenDataNotice(complete), null);
  assert.ok(productInfoRows(complete).some(([label, value]) =>
    label === "Alerjenler" && value === "Kaynakta bildirilen alerjen yok"));
});

test("partial quality becomes one short user-facing message", () => {
  assert.equal(
    partialProductDataNotice({ dataQuality: { status: "QUALITY_PARTIAL" } }),
    "Bazı ürün veya besin bilgileri eksik.",
  );
  assert.equal(
    partialProductDataNotice({ dataQuality: { status: "QUALITY_ACCEPTED" } }),
    null,
  );
});

test("comparison summary omits missing fields rather than repeating placeholders", () => {
  assert.equal(
    comparisonNutritionText({ proteinG: 8, fiberG: null, sugarsG: null }),
    "Protein 8 g",
  );
});
