const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const source = readFileSync(join(__dirname, "../src/application/health/nutrition-plan-store.ts"), "utf8");

test("generation timing includes request and next-frame measurements without progress fabrication", () => {
  assert.match(source, /performance\.measure\("diewish:nutrition-plan:request-ms"/);
  assert.match(source, /performance\.measure\("diewish:nutrition-plan:post-response-frame-ms"/);
  assert.match(source, /recordPlanDisplayTiming\(startedAt\)/);
  assert.match(source, /const result = completeGeneration\(plan\)/);
  assert.match(source, /recordPlanDisplayTiming\(startedAt\);\s*return result/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /percentComplete/);
});
