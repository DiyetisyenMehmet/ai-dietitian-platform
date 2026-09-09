import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFoodScanDisclaimer } from "./food-scan-disclaimer";
import type { FoodVisionResult } from "./types";

function vision(overrides: Partial<FoodVisionResult> = {}): FoodVisionResult {
  return {
    isFood: true,
    confidence: 98,
    reason: "Gıda görseli",
    dishName: "Karpuz",
    estimatedPortion: "Yaklaşık 1 büyük dilim, yalnızca yenilebilir kısım",
    estimatedGrams: 350,
    ingredients: [{ name: "karpuz", estimatedGrams: 350, confidence: 98, optional: false }],
    disclaimer: "Görsel tahminidir.",
    ...overrides,
  };
}

test("simple single-food scan does not show recipe oil or sauce warning", () => {
  const disclaimer = buildFoodScanDisclaimer(vision(), false);

  assert.match(disclaimer, /Görsel tanıma ve yenilebilir porsiyon miktarı tahminidir/);
  assert.match(disclaimer, /güvenilir besin verilerinden deterministik olarak hesaplanır/);
  assert.doesNotMatch(disclaimer, /tarif/i);
  assert.doesNotMatch(disclaimer, /yağ/i);
  assert.doesNotMatch(disclaimer, /sos/i);
  assert.doesNotMatch(disclaimer, /isteğe bağlı malzemeler/i);
});

test("mixed dish receives cooking and uncertain ingredient warning", () => {
  const disclaimer = buildFoodScanDisclaimer(
    vision({
      dishName: "Bulgur pilavı ve kabak yemeği",
      ingredients: [
        { name: "bulgur", estimatedGrams: 120, confidence: 95, optional: false },
        { name: "kabak", estimatedGrams: 110, confidence: 95, optional: false },
        { name: "zeytinyağı", estimatedGrams: 10, confidence: 60, optional: true },
      ],
    }),
    false,
  );

  assert.match(disclaimer, /tarif bileşimi tahminidir/i);
  assert.match(disclaimer, /yağ, sos/i);
  assert.match(disclaimer, /siz dahil etmedikçe toplama eklenmez/i);
});

test("edible-weight safety notice is preserved when guard blocks gross weight", () => {
  const disclaimer = buildFoodScanDisclaimer(vision(), true);

  assert.match(disclaimer, /yenmeyen kısımları ağırlığa dahil ettiği için/i);
  assert.match(disclaimer, /Malzemeleri Düzenle/i);
});
