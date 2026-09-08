import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FOOD_VISION_VERTEX_RESPONSE_SCHEMA,
  resolveFoodVisionProviderKind,
} from "./food-vision.provider";

test("explicit Vertex selection wins without OpenAI or Abacus API keys", () => {
  assert.equal(resolveFoodVisionProviderKind({ aiProvider: "vertex" }), "vertex");
  assert.equal(
    resolveFoodVisionProviderKind({ aiProvider: "vertex", aiApiKey: "openai", abacusApiKey: "abacus" }),
    "vertex",
  );
});

test("legacy automatic selection remains backward compatible", () => {
  assert.equal(resolveFoodVisionProviderKind({ abacusApiKey: "abacus" }), "abacus");
  assert.equal(resolveFoodVisionProviderKind({ aiApiKey: "openai" }), "openai");
});

test("Vertex food-vision schema contains recognition fields but no nutrition facts", () => {
  const schema = JSON.stringify(FOOD_VISION_VERTEX_RESPONSE_SCHEMA);
  assert.match(schema, /dishName/);
  assert.match(schema, /estimatedGrams/);
  assert.match(schema, /ingredients/);
  assert.doesNotMatch(schema, /calories/i);
  assert.doesNotMatch(schema, /proteinG/i);
  assert.doesNotMatch(schema, /carbsG/i);
  assert.doesNotMatch(schema, /fatG/i);
});
