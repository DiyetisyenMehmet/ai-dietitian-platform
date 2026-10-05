const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, imports, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      if (name in imports) return imports[name];
      throw new Error(`Unexpected import: ${name}`);
    },
    console,
    Headers,
    ...globals,
  });
  return exports;
}
function http(fetch) {
  return load(
    "infrastructure/api/http-client.ts",
    {
      "@/application/config/env": {
        env: { apiBaseUrl: "http://fixture/api" },
        isApiConfigured: () => true,
      },
    },
    { fetch },
  );
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function store(client) {
  return load("application/health/nutrition-plan-store.ts", {
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    "@/infrastructure/nutrition/nutrition-plan-client": {
      nutritionPlanClient: client,
      isSupportedNutritionPlanDuration: (d) =>
        ["SEVEN_DAY", "FOURTEEN_DAY", "THIRTY_DAY"].includes(d),
    },
  });
}
const plan = (id) => ({
  id,
  duration: "SEVEN_DAY",
  status: "COMPLETED",
  isActive: true,
  updatedAt: "2026-10-05",
  createdAt: "2026-10-05",
  dailyPlans: {},
});

test("HTTP error preserves entitlement reason and plan feedback explains each expected gate", async () => {
  const { ApiError, apiRequest } = http(async () => ({
    ok: false,
    status: 403,
    json: async () => ({
      success: false,
      error: {
        code: "SUBSCRIPTION_REQUIRED",
        message: "fixture",
        details: { reason: "FREE_DURATION_RESTRICTED" },
      },
    }),
  }));
  const { planError } = load("presentation/components/meals/nutrition-plan-errors.ts", {
    "@/infrastructure/api/http-client": { ApiError },
  });
  let error;
  await assert.rejects(apiRequest({ path: "/nutrition-plans/generate" }), (e) => {
    error = e;
    return e.details.reason === "FREE_DURATION_RESTRICTED";
  });
  assert.match(planError(error), /7 günlük.*14 ve 30/);
  const generic = planError(new Error("untrusted provider text"));
  for (const [code, status, phrase] of [
    ["CONSENT_REQUIRED", 403, /onay/],
    ["WEIGHT_CHECK_IN_REQUIRED", 403, /kilo check-in/],
    ["NUTRITION_PLAN_SAFETY_REVIEW_REQUIRED", 422, /uzman/],
    ["AI_QUOTA_EXCEEDED", 429, /limit/],
    ["NUTRITION_PLAN_INCOMPLETE", 502, /tüm günleri/],
    ["AI_PROVIDER_MALFORMED", 502, /tüm günleri/],
    ["AI_PROVIDER_UNREACHABLE", 502, /ulaşılamıyor/],
    ["AI_NOT_CONFIGURED", 500, /ulaşılamıyor/],
    ["NUTRITION_PLAN_GENERATION_IN_PROGRESS", 409, /hazırlanıyor/],
    ["NUTRITION_PLAN_ALLERGEN_VALIDATION_FAILED", 502, /kaydedilmedi/],
    ["NUTRITION_PLAN_TARGET_MISMATCH", 502, /kaydedilmedi/],
    ["NUTRITION_PLAN_REALISM_VALIDATION_FAILED", 502, /kaydedilmedi/],
    ["NUTRITION_PLAN_MEAL_STRUCTURE_MISMATCH", 502, /kaydedilmedi/],
    [undefined, 0, /Bağlantı/],
    [undefined, 504, /süresi/],
  ]) {
    const message = planError(new ApiError("untrusted provider text", status, code));
    assert.notEqual(message, generic);
    assert.match(message, phrase);
    assert.doesNotMatch(message, /untrusted/);
  }
  assert.equal(planError(new ApiError("secret", 500, "UNEXPECTED")), generic);
  assert.match(
    planError(new ApiError("", 403, "SUBSCRIPTION_REQUIRED", { reason: "FREE_TRIAL_EXHAUSTED" })),
    /hakkını kullandın/,
  );
});

test("loading guard prevents duplicate request, success updates active plan, history survives hydration", async () => {
  const pending = deferred();
  let calls = 0;
  const module = store({
    generate: () => {
      calls++;
      return pending.promise;
    },
    list: async () => ({ plans: [plan("new"), { ...plan("old"), isActive: false }] }),
  });
  const work = module.nutritionPlanStore.generate("SEVEN_DAY");
  assert.equal(module.useNutritionPlan().generating, true);
  await assert.rejects(module.nutritionPlanStore.generate("SEVEN_DAY"), /already in progress/);
  assert.equal(calls, 1);
  pending.resolve({ plan: plan("new") });
  await work;
  assert.equal(module.useNutritionPlan().generating, false);
  assert.equal(module.useNutritionPlan().activePlan.id, "new");
  await module.nutritionPlanStore.hydrateFromBackend();
  assert.equal(module.useNutritionPlan().plans.length, 2);
  assert.equal(module.useNutritionPlan().activePlan.id, "new");
});

test("failed generation unlocks; a failed concurrent hydrate cannot unlock an ongoing request", async () => {
  const pending = deferred();
  let calls = 0;
  const module = store({
    generate: () => {
      calls++;
      return pending.promise;
    },
    list: async () => {
      throw new Error("network");
    },
  });
  const work = module.nutritionPlanStore.generate("SEVEN_DAY");
  await module.nutritionPlanStore.hydrateFromBackend();
  assert.equal(module.useNutritionPlan().generating, true);
  await assert.rejects(module.nutritionPlanStore.generate("SEVEN_DAY"));
  assert.equal(calls, 1);
  pending.reject(new Error("provider"));
  await assert.rejects(work, /provider/);
  assert.equal(module.useNutritionPlan().generating, false);
  assert.equal(module.useNutritionPlan().generatingDuration, null);
});

test("an older list response does not erase a newly completed plan", async () => {
  const list = deferred();
  const module = store({ list: () => list.promise, generate: async () => ({ plan: plan("new") }) });
  const hydrate = module.nutritionPlanStore.hydrateFromBackend();
  await module.nutritionPlanStore.generate("SEVEN_DAY");
  list.resolve({ plans: [] });
  await hydrate;
  assert.equal(module.useNutritionPlan().activePlan.id, "new");
  assert.equal(module.useNutritionPlan().loading, false);
});
