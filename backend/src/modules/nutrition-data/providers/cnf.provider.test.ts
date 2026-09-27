import assert from "node:assert/strict";
import { test } from "node:test";

import { CanadianNutrientFileProvider } from "./cnf.provider";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("CNF provider resolves a food and maps core per-100g nutrients", async () => {
  const requests: string[] = [];
  const provider = new CanadianNutrientFileProvider(async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("/food/") && !url.includes("&id=")) {
      return jsonResponse([
        { food_code: 101, food_description: "Walnuts, english, dried" },
        { food_code: 102, food_description: "Chicken breast, roasted" },
      ]);
    }
    if (url.includes("/nutrientamount/") && url.includes("id=101")) {
      return jsonResponse([
        { food_code: 101, nutrient_name_id: 208, nutrient_web_name: "Energy (kcal)", nutrient_value: 654, nutrient_source_id: 3 },
        { food_code: 101, nutrient_name_id: 203, nutrient_web_name: "Protein", nutrient_value: 15.2, nutrient_source_id: 3 },
        { food_code: 101, nutrient_name_id: 205, nutrient_web_name: "Carbohydrate, total", nutrient_value: 13.7, nutrient_source_id: 3 },
        { food_code: 101, nutrient_name_id: 204, nutrient_web_name: "Total fat", nutrient_value: 65.2, nutrient_source_id: 3 },
        { food_code: 101, nutrient_name_id: 291, nutrient_web_name: "Fibre, total dietary", nutrient_value: 6.7, nutrient_source_id: 3 },
        { food_code: 101, nutrient_name_id: 307, nutrient_web_name: "Sodium, Na", nutrient_value: 2, nutrient_source_id: 3 },
      ]);
    }
    return jsonResponse([]);
  });

  const foods = await provider.search("walnuts", 5);
  assert.equal(foods.length, 1);
  assert.equal(foods[0]?.provider, "CNF");
  assert.equal(foods[0]?.externalId, "101");
  assert.equal(foods[0]?.nutrientsPer100g.energyKcal, 654);
  assert.equal(foods[0]?.nutrientsPer100g.proteinG, 15.2);
  assert.equal(foods[0]?.nutrientsPer100g.carbohydratesG, 13.7);
  assert.equal(foods[0]?.nutrientsPer100g.fatG, 65.2);
  assert.equal(foods[0]?.nutrientsPer100g.fiberG, 6.7);
  assert.equal(foods[0]?.nutrientsPer100g.sodiumMg, 2);
  assert.equal(foods[0]?.provenance.dataBasis, "PER_100_G");
  assert.ok(requests.some((url) => url.includes("nutrientamount")));
});

test("CNF provider rejects unrelated food-list noise instead of inventing a match", async () => {
  const provider = new CanadianNutrientFileProvider(async () =>
    jsonResponse([
      { food_code: 201, food_description: "Salmon, baked" },
      { food_code: 202, food_description: "Rice, white, cooked" },
    ]),
  );

  assert.deepEqual(await provider.search("walnuts", 5), []);
});
