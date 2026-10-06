import assert from "node:assert/strict";
import test from "node:test";
import { VertexAIAdapter } from "../blood-test-analysis/ai-adapter/vertex-ai.adapter";
import { NUTRITION_PLAN_SYSTEM_PROMPT } from "./constants";
import { DOCUMENT_VALIDATION_SYSTEM_PROMPT } from "../blood-test-analysis/validation/document-validation.constants";
import { ApiError } from "../../utils/api-error";
import { withNutritionProviderBudget } from "./nutrition-plan-provider-budget";

class Provider extends VertexAIAdapter {
  complete(system: string) {
    return this.chat([
      { role: "system", content: system },
      { role: "user", content: "Synthetic test" },
    ]);
  }
}
function provider() {
  return new Provider({
    project: "fixture",
    location: "global",
    model: "gemini-3.5-flash",
    maxTokens: 4096,
    temperature: 0.2,
  });
}

test("nutrition alone uses supported MINIMAL thinking; JSON schema and other tasks remain intact", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  const configurations: Record<string, unknown>[] = [];
  global.fetch = async (url, options) => {
    if (String(url).includes("metadata.google.internal"))
      return Response.json({ access_token: "fixture-token", expires_in: 300 });
    configurations.push(JSON.parse(String(options?.body)).generationConfig);
    return Response.json({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{}" }] } }],
    });
  };
  const adapter = provider();
  await adapter.complete(NUTRITION_PLAN_SYSTEM_PROMPT);
  await adapter.complete(DOCUMENT_VALIDATION_SYSTEM_PROMPT);
  assert.deepEqual(configurations[0].thinkingConfig, { thinkingLevel: "MINIMAL" });
  assert.deepEqual(configurations[1].thinkingConfig, { thinkingLevel: "LOW" });
  assert.equal(configurations[0].responseMimeType, "application/json");
  assert.ok(configurations[0].responseSchema);
  assert.equal(configurations[0].maxOutputTokens, 8192);
});

test("a total generation timeout cancels actual provider fetch without another transport retry", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  let calls = 0;
  global.fetch = async (url, options) => {
    if (String(url).includes("metadata.google.internal"))
      return Response.json({ access_token: "fixture-token", expires_in: 300 });
    calls++;
    assert.ok(options?.signal);
    return new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Provider failed to cancel")), 200);
      options.signal!.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(options.signal!.reason);
        },
        { once: true },
      );
    });
  };
  await assert.rejects(
    withNutritionProviderBudget(30, () => provider().complete(NUTRITION_PLAN_SYSTEM_PROMPT)),
    (error) => error instanceof ApiError && error.code === "NUTRITION_PLAN_GENERATION_TIMEOUT",
  );
  assert.equal(calls, 1);
});
