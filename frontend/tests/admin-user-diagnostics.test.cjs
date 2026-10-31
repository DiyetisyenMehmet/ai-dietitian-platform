const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const source = fs.readFileSync(
  path.join(__dirname, "../src/presentation/components/admin/admin-user-diagnostics.ts"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});
const loaded = { exports: {} };
new Function("exports", "module", compiled.outputText)(loaded.exports, loaded);
const { userDiagnoses } = loaded.exports;
const user = {
  id: "u",
  isActive: true,
  emailVerifiedAt: "2026-10-01T00:00:00Z",
  onboardingCompleted: true,
  lastLoginAt: "2026-10-01T00:00:00Z",
};
const ready = (data) => ({ status: "ready", data });
const unavailable = { status: "unavailable" };
const subscription = {
  currentPlan: "FREE",
  providerPlan: "FREE",
  currentPlanSource: "ACCOUNT_DEFAULT",
  supportEntitlement: null,
};
function diagnose(
  changes = {},
  plan = ready(subscription),
  sessions = ready({ total: 0 }),
  audit = ready([]),
) {
  return Object.fromEntries(
    userDiagnoses({ ...user, ...changes }, plan, sessions, audit).map((entry) => [
      entry.key,
      entry,
    ]),
  );
}
test("inactive, unverified and incomplete accounts use distinct evidence classes", () => {
  const result = diagnose({
    isActive: false,
    emailVerifiedAt: null,
    onboardingCompleted: false,
    lastLoginAt: null,
  });
  assert.equal(result.account.classification, "TESPİT EDİLDİ");
  assert.equal(result.email.classification, "OLASI NEDEN");
  assert.equal(result.onboarding.classification, "OLASI NEDEN");
  assert.equal(result.login.classification, "DOĞRULANAMADI");
});
test("healthy facts do not infer successful login from session absence", () => {
  const result = diagnose();
  assert.equal(result.account.classification, "SORUN TESPİT EDİLEMEDİ");
  assert.match(result.sessions.evidence, /0 aktif/);
  assert.match(result.sessions.evidence, /kanıtlamaz/);
  assert.equal(result.login.classification, "DOĞRULANAMADI");
});
test("authorization, loading and independent service failure remain unknown", () => {
  for (const status of ["unavailable", "loading", "error"]) {
    const result = diagnose({}, { status }, { status }, { status });
    for (const key of ["subscription", "sessions", "audit"])
      assert.equal(result[key].classification, "DOĞRULANAMADI");
    assert.equal(result.account.classification, "SORUN TESPİT EDİLEMEDİ");
  }
});
test("valid support override is not reported as a provider mismatch", () => {
  const result = diagnose(
    {},
    ready({
      ...subscription,
      currentPlan: "PREMIUM_PLUS",
      currentPlanSource: "ADMIN_SUPPORT",
      supportEntitlement: { status: "ACTIVE", tier: "PREMIUM_PLUS" },
    }),
  );
  assert.equal(result.subscription.classification, "SORUN TESPİT EDİLEMEDİ");
});
test("unexplained provider mismatch and invalid support are only possible causes", () => {
  for (const plan of [
    { ...subscription, currentPlan: "PREMIUM" },
    {
      ...subscription,
      currentPlan: "PREMIUM",
      currentPlanSource: "ADMIN_SUPPORT",
      supportEntitlement: { status: "REVOKED", tier: "PREMIUM" },
    },
  ]) {
    const result = diagnose({}, ready(plan));
    assert.equal(result.subscription.classification, "OLASI NEDEN");
    assert.match(result.subscription.evidence, /kanıtı değildir/);
  }
});
test("audit absence is never treated as evidence that Admin intervention did not occur", () => {
  assert.equal(diagnose().audit.classification, "DOĞRULANAMADI");
  assert.match(diagnose().audit.evidence, /Görüntülenebilir yakın kayıt bulunamadı/);
  assert.equal(
    diagnose({}, ready(subscription), unavailable, ready([{ id: "actual-event" }])).audit
      .classification,
    "TESPİT EDİLDİ",
  );
});
