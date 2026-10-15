const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");
function fixture(client) {
  const timers = [];
  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  const exports = {};
  const source = fs.readFileSync(
    require("node:path").join(__dirname, "../src/application/health/nutrition-plan-store.ts"),
    "utf8",
  );
  const imports = {
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    "@/infrastructure/api/http-client": { ApiError },
    "@/infrastructure/nutrition/nutrition-plan-client": {
      nutritionPlanClient: client,
      isSupportedNutritionPlanDuration: (d) =>
        ["SEVEN_DAY", "FOURTEEN_DAY", "THIRTY_DAY"].includes(d),
    },
  };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require: (name) => imports[name],
      crypto,
      console,
      setTimeout: (fn) => {
        timers.push(fn);
        return timers.length;
      },
    },
  );
  return { ...exports, timers, ApiError };
}
const job = {
  id: "owned-job",
  kind: "NEW_PLAN",
  duration: "FOURTEEN_DAY",
  status: "RUNNING",
  completedDays: 5,
  totalDays: 14,
  errorCode: null,
};
const plan = (id) => ({
  id,
  duration: "FOURTEEN_DAY",
  status: "COMPLETED",
  isActive: true,
  updatedAt: "2026-10-14",
  createdAt: "2026-10-14",
  dailyPlans: {},
});
const settle = () => new Promise((resolve) => setImmediate(resolve));
test("hydrate recovers progress; ready delivery updates active plan once", async () => {
  let deliveries = 0;
  const module = fixture({
    list: async () => ({ plans: [plan("old")] }),
    capabilities: async () => ({ resumable: true }),
    currentPreparation: async () => ({ job }),
    preparation: async () => ({ job: { ...job, status: "READY", completedDays: 14 } }),
    deliverPreparation: async () => {
      deliveries++;
      return { plan: plan("new") };
    },
  });
  await module.nutritionPlanStore.hydrateFromBackend();
  assert.equal(module.useNutritionPlan().generating, true);
  assert.equal(module.useNutritionPlan().preparation.completedDays, 5);
  module.timers.shift()();
  await settle();
  assert.equal(deliveries, 1);
  assert.equal(module.useNutritionPlan().activePlan.id, "new");
  assert.equal(module.useNutritionPlan().generating, false);
  module.nutritionPlanStore.reset();
});
test("confirmed pause stops watcher only after server response and preserves active plan", async () => {
  let resolve,
    pauseCalls = 0,
    polls = 0;
  const pending = new Promise((r) => {
    resolve = r;
  });
  const module = fixture({
    list: async () => ({ plans: [plan("old")] }),
    capabilities: async () => ({ resumable: true }),
    currentPreparation: async () => ({ job }),
    pausePreparation: async () => {
      pauseCalls++;
      return pending;
    },
    preparation: async () => {
      polls++;
      return { job };
    },
  });
  await module.nutritionPlanStore.hydrateFromBackend();
  const pause = module.nutritionPlanStore.pausePreparation();
  assert.equal(module.useNutritionPlan().generating, true);
  resolve({ job: { ...job, status: "PAUSED" } });
  await pause;
  assert.equal(pauseCalls, 1);
  assert.equal(module.useNutritionPlan().preparation.status, "PAUSED");
  assert.equal(module.useNutritionPlan().activePlan.id, "old");
  module.timers.shift()();
  await settle();
  assert.equal(polls, 0);
  module.nutritionPlanStore.reset();
});
test("account reset fences late job polling and cross-device consumed job loads delivered plan", async () => {
  let polls = 0;
  const a = fixture({
    list: async () => ({ plans: [] }),
    capabilities: async () => ({ resumable: true }),
    currentPreparation: async () => ({ job }),
    preparation: async () => {
      polls++;
      return { job };
    },
  });
  await a.nutritionPlanStore.hydrateFromBackend();
  a.nutritionPlanStore.reset();
  a.timers.shift()();
  await settle();
  assert.equal(polls, 0);
  assert.equal(a.useNutritionPlan().preparation, null);
  const b = fixture({
    list: async () => ({ plans: [] }),
    capabilities: async () => ({ resumable: true }),
    currentPreparation: async () => ({ job }),
    preparation: async () => ({
      job: { ...job, status: "CONSUMED", deliveredPlanId: "other-device-plan" },
    }),
    get: async () => ({ plan: plan("other-device-plan") }),
  });
  await b.nutritionPlanStore.hydrateFromBackend();
  b.timers.shift()();
  await settle();
  assert.equal(b.useNutritionPlan().activePlan.id, "other-device-plan");
  b.nutritionPlanStore.reset();
});
test("busy delivery followed by a lost status request recovers through guarded polling", async () => {
  let reads = 0,
    deliveries = 0,
    module;
  module = fixture({
    list: async () => ({ plans: [plan("old")] }),
    capabilities: async () => ({ resumable: true }),
    currentPreparation: async () => ({ job: { ...job, status: "READY" } }),
    preparation: async () => {
      reads++;
      if (reads === 1) throw new module.ApiError("offline", 0, "NETWORK_ERROR");
      return { job: { ...job, status: "READY" } };
    },
    deliverPreparation: async () => {
      deliveries++;
      if (deliveries === 1)
        throw new module.ApiError("busy", 409, "NUTRITION_PLAN_GENERATION_IN_PROGRESS");
      return { plan: plan("recovered") };
    },
  });
  await module.nutritionPlanStore.hydrateFromBackend();
  await settle();
  module.timers.shift()();
  await settle();
  assert.equal(module.useNutritionPlan().preparationOffline, true);
  assert.equal(module.useNutritionPlan().activePlan.id, "old");
  module.timers.shift()();
  await settle();
  module.timers.shift()();
  await settle();
  assert.equal(deliveries, 2);
  assert.equal(reads, 2);
  assert.equal(module.useNutritionPlan().activePlan.id, "recovered");
  assert.equal(module.useNutritionPlan().preparationOffline, false);
  module.nutritionPlanStore.reset();
});
test("a server-confirmed pause on another device is recovered before another delivery", async () => {
  let deliveries = 0,
    module;
  module = fixture({
    list: async () => ({ plans: [plan("old")] }),
    capabilities: async () => ({ resumable: true }),
    currentPreparation: async () => ({ job: { ...job, status: "READY" } }),
    preparation: async () => ({ job: { ...job, status: "PAUSED" } }),
    deliverPreparation: async () => {
      deliveries++;
      throw new module.ApiError("paused remotely", 409, "NUTRITION_JOB_NOT_READY");
    },
  });
  await module.nutritionPlanStore.hydrateFromBackend();
  await settle();
  module.timers.shift()();
  await settle();
  assert.equal(deliveries, 1);
  assert.equal(module.useNutritionPlan().preparation.status, "PAUSED");
  assert.equal(module.useNutritionPlan().generating, false);
  assert.equal(module.useNutritionPlan().activePlan.id, "old");
  module.nutritionPlanStore.reset();
});
test("a failed consumed-plan read from an old account cannot change the new account state", async () => {
  let rejectRead;
  const read = new Promise((_, reject) => {
    rejectRead = reject;
  });
  const module = fixture({
    list: async () => ({ plans: [] }),
    capabilities: async () => ({ resumable: true }),
    currentPreparation: async () => ({
      job: { ...job, status: "CONSUMED", deliveredPlanId: "delivered" },
    }),
    get: async () => read,
  });
  await module.nutritionPlanStore.hydrateFromBackend();
  module.nutritionPlanStore.reset();
  rejectRead(new Error("old connection closed"));
  await settle();
  assert.equal(module.useNutritionPlan().preparationOffline, false);
  assert.equal(module.useNutritionPlan().activePlan, null);
});
test("a cross-device delivery releases the request key for the next explicit generation", async () => {
  const keys = [];
  const module = fixture({
    list: async () => ({ plans: [] }),
    capabilities: async () => ({ resumable: true }),
    currentPreparation: async () => ({ job: null }),
    startPreparation: async (_duration, _pantry, key) => {
      keys.push(key);
      return { job: { ...job, id: `job-${keys.length}` } };
    },
    preparation: async () => ({
      job: { ...job, id: "job-1", status: "CONSUMED", deliveredPlanId: "delivered" },
    }),
    get: async () => ({ plan: plan("delivered") }),
  });
  await module.nutritionPlanStore.hydrateFromBackend();
  await module.nutritionPlanStore.generate("FOURTEEN_DAY");
  module.timers.shift()();
  await settle();
  assert.equal(module.useNutritionPlan().activePlan.id, "delivered");
  await module.nutritionPlanStore.generate("FOURTEEN_DAY");
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
  module.nutritionPlanStore.reset();
});
