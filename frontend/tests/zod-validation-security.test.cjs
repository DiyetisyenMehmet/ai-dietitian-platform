const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { zodResolver } = require("@hookform/resolvers/zod");
function load(file) {
  const name = path.resolve("src", file);
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(name, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      module,
      exports: module.exports,
      Date,
      Set,
      TextEncoder,
      require: (request) =>
        request.startsWith("@/") ? load(request.slice(2) + ".ts") : require(request),
    },
  );
  return module.exports;
}
const auth = load("domain/auth/validation.ts");
const meals = load("domain/meals/validation.ts");
const goals = load("domain/goals/validation.ts");
const onboarding = load("domain/onboarding/validation.ts");
const options = { fields: {}, shouldUseNativeValidation: false };
const resolve = (schema, input) => zodResolver(schema)(input, {}, options);

test("real resolver returns parsed login defaults and Turkish field errors", async () => {
  const valid = await resolve(auth.loginSchema, { email: "user@example.com", password: "secret" });
  assert.deepEqual(valid.values, {
    email: "user@example.com",
    password: "secret",
    rememberMe: false,
  });
  assert.deepEqual(valid.errors, {});
  const invalid = await resolve(auth.loginSchema, { email: "invalid", password: "" });
  assert.equal(invalid.errors.email.message, "Geçerli bir e-posta adresi girin.");
  assert.equal(invalid.errors.password.message, "Şifre gereklidir.");
  assert.deepEqual(invalid.values, {});
});
test("password reset keeps matching, strength and UTF-8 byte constraints", async () => {
  for (const [password, confirmPassword] of [
    ["weak", "weak"],
    ["Strong123", "different"],
    ["Ş".repeat(40) + "aA1", "Ş".repeat(40) + "aA1"],
  ]) {
    const result = await resolve(auth.resetPasswordSchema, { password, confirmPassword });
    assert.ok(Object.keys(result.errors).length > 0);
  }
  assert.equal(
    auth.resetPasswordSchema.safeParse({ password: "Strong123", confirmPassword: "Strong123" })
      .success,
    true,
  );
});
test("meal numeric/enum constraints keep their localized messages", async () => {
  const meal = {
    name: " Apple ",
    quantity: "1 adet",
    calories: 95,
    protein: 1,
    carbs: 20,
    fat: 0,
    mealSlot: "breakfast",
    time: "08:00",
  };
  const valid = await resolve(meals.addMealSchema, meal);
  assert.equal(valid.values.name, "Apple");
  assert.deepEqual(valid.errors, {});
  for (const value of ["95", NaN]) {
    const invalid = await resolve(meals.addMealSchema, {
      ...meal,
      calories: value,
      mealSlot: "invalid",
    });
    assert.equal(invalid.errors.calories.message, "Kalori sayı olmalıdır");
    assert.equal(invalid.errors.mealSlot.message, "Öğün türü seçiniz");
  }
  for (const value of [-1, 10001])
    assert.equal(meals.addMealSchema.safeParse({ ...meal, calories: value }).success, false);
});
test("goal resolver keeps date ordering and Turkish number/enum errors", async () => {
  const goal = {
    type: "water",
    targetValue: 2000,
    startDate: "2026-10-20",
    targetDate: "2026-10-23",
  };
  assert.equal(goals.goalFormSchema.safeParse(goal).success, true);
  const invalid = await resolve(goals.goalFormSchema, {
    ...goal,
    type: "invalid",
    targetValue: "2000",
  });
  assert.equal(invalid.errors.type.message, "Hedef türü seçiniz");
  assert.equal(invalid.errors.targetValue.message, "Hedef değer sayı olmalıdır");
  const dates = await resolve(goals.goalFormSchema, { ...goal, targetDate: "2026-10-19" });
  assert.equal(
    dates.errors.targetDate.message,
    "Hedef tarihi, başlangıç tarihinden sonra olmalıdır",
  );
});
test("health onboarding keeps medical ranges and sentinel-to-payload conversion", async () => {
  const types = load("domain/onboarding/types.ts");
  const form = {
    fullName: "Synthetic Patient",
    dateOfBirth: "1990-01-01",
    gender: "OTHER",
    heightCm: "170",
    currentWeightKg: "72",
    targetWeightKg: "70",
    activityLevel: "MODERATE",
    healthConditions: [types.NO_HEALTH_CONDITION],
    allergies: [types.NO_ALLERGY],
    dietaryPreference: "OMNIVORE",
    dailyWaterGoalMl: "2000",
    workScheduleType: "REGULAR",
    usualWakeTime: "07:00",
    usualSleepTime: "23:00",
  };
  const result = await resolve(onboarding.onboardingFormSchema, form);
  assert.deepEqual(result.errors, {});
  const payload = onboarding.toOnboardingPayload(result.values);
  assert.equal(payload.heightCm, 170);
  assert.equal(payload.currentWeightKg, 72);
  assert.equal(payload.dailyWaterGoalMl, 2000);
  assert.equal(payload.healthConditions.length, 0);
  assert.equal(payload.allergies.length, 0);
  for (const values of [
    { currentWeightKg: "401" },
    { heightCm: "79" },
    { dailyWaterGoalMl: "6001" },
    { dateOfBirth: "2999-01-01" },
  ]) {
    assert.equal(onboarding.onboardingFormSchema.safeParse({ ...form, ...values }).success, false);
  }
});
test("both health form lists reject oversized data without inspecting elements", () => {
  for (const field of ["healthConditions", "allergies"]) {
    const schema = onboarding.onboardingFormSchema.shape[field];
    assert.equal(schema.safeParse(Array(30).fill("entry")).success, true);
    assert.equal(schema.safeParse([]).success, false);
    const input = Array(100_000);
    Object.defineProperty(input, 0, {
      get() {
        throw new Error("element inspected before size bound");
      },
    });
    const result = schema.safeParse(input);
    assert.equal(result.success, false);
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, "too_big");
  }
});
test("all application Zod collection declarations have an explicit leading size cap", () => {
  let count = 0;
  for (const area of ["src", "../backend/src"]) {
    function scan(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(file);
          continue;
        }
        if (!/\.tsx?$/.test(file) || /\.test\.ts$/.test(file)) continue;
        const text = fs.readFileSync(file, "utf8");
        if (!/from ["']zod["']/.test(text)) continue;
        assert.doesNotMatch(text, /from ["']zod\/v3["']/);
        const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
        function visit(node) {
          if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.expression.getText(tree) === "z" &&
            ["array", "set", "map"].includes(node.expression.name.text)
          ) {
            count++;
            let current = node,
              capped = false;
            while (
              ts.isPropertyAccessExpression(current.parent) &&
              ts.isCallExpression(current.parent.parent)
            ) {
              const method = current.parent.name.text;
              if (["max", "length", "size"].includes(method)) {
                capped = true;
                break;
              }
              if (method !== "min") break;
              current = current.parent.parent;
            }
            assert.ok(capped, `${file}: collection lacks a leading size bound`);
          }
          ts.forEachChild(node, visit);
        }
        visit(tree);
      }
    }
    scan(area);
  }
  assert.equal(count, 18);
});
