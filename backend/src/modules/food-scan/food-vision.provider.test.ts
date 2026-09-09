import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError } from "../../utils/api-error";
import {
  FOOD_VISION_VERTEX_RESPONSE_SCHEMA,
  parseFoodVisionJson,
  resolveFoodVisionProviderKind,
  resolveVertexProjectId,
} from "./food-vision.provider";

test("explicit Vertex selection wins without OpenAI or Abacus API keys", () => {
  assert.equal(resolveFoodVisionProviderKind({ aiProvider: "vertex" }), "vertex");
  assert.equal(
    resolveFoodVisionProviderKind({ aiProvider: "vertex", aiApiKey: "openai", abacusApiKey: "abacus" }),
    "vertex",
  );
});

test("legacy keyed providers remain backward compatible while keyless runtime defaults to Vertex", () => {
  assert.equal(resolveFoodVisionProviderKind({ abacusApiKey: "abacus" }), "abacus");
  assert.equal(resolveFoodVisionProviderKind({ aiApiKey: "openai" }), "openai");
  assert.equal(resolveFoodVisionProviderKind({}), "vertex");
});

test("configured Vertex project avoids a metadata request", async () => {
  let called = false;
  const project = await resolveVertexProjectId(" project-configured ", async () => {
    called = true;
    throw new Error("metadata must not be called");
  });

  assert.equal(project, "project-configured");
  assert.equal(called, false);
});

test("Vertex project falls back to the Cloud Run metadata server", async () => {
  const project = await resolveVertexProjectId("", async (input, init) => {
    assert.equal(
      String(input),
      "http://metadata.google.internal/computeMetadata/v1/project/project-id",
    );
    assert.deepEqual(init?.headers, { "Metadata-Flavor": "Google" });
    return new Response("project-runtime\n", { status: 200 });
  });

  assert.equal(project, "project-runtime");
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

test("food-vision JSON parser accepts fenced and surrounding structured JSON", () => {
  assert.deepEqual(parseFoodVisionJson("```json\n{\"isFood\":false}\n```"), { isFood: false });
  assert.deepEqual(parseFoodVisionJson("prefix {\"isFood\":true} suffix"), { isFood: true });
});

test("truncated provider JSON is always converted to a controlled 502 instead of SyntaxError/500", () => {
  assert.throws(
    () => parseFoodVisionJson('prefix {"isFood":true,"ingredients":[{"name":"elma"}'),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.statusCode, 502);
      assert.equal(error.code, "FOOD_SCAN_PROVIDER_MALFORMED");
      return true;
    },
  );
});
