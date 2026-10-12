import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../../config/env";
import { adminPasswordIdentityProvider as provider } from "./admin-password-identity.provider";

test("Admin Firebase codes remain provider-owned and carry explicit Admin continuation", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = env.FIREBASE_WEB_API_KEY;
  const originalUrl = env.APP_WEB_URL;
  env.FIREBASE_WEB_API_KEY = "synthetic-test-key";
  env.APP_WEB_URL = "https://staging.diewish.com";
  const calls: Array<{ action: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (url, options) => {
    calls.push({
      action: String(url).split("accounts:")[1]!.split("?")[0]!,
      body: JSON.parse(String(options?.body)),
    });
    return new Response(
      JSON.stringify({ email: "synthetic@example.com", requestType: "PASSWORD_RESET" }),
      { status: 200 },
    );
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    env.FIREBASE_WEB_API_KEY = originalKey;
    env.APP_WEB_URL = originalUrl;
  });
  await provider.sendPasswordReset("synthetic@example.com", "invitation");
  assert.equal(calls[0]!.action, "sendOobCode");
  assert.equal(
    calls[0]!.body.continueUrl,
    "https://staging.diewish.com/admin/reset-password?context=invitation",
  );
  assert.equal(calls[0]!.body.requestType, "PASSWORD_RESET");
  await provider.verifyPasswordReset("synthetic-code");
  assert.deepEqual(calls[1], { action: "resetPassword", body: { oobCode: "synthetic-code" } });
  await provider.confirmPasswordReset("synthetic-code", "SyntheticPassword123!");
  assert.deepEqual(calls[2], {
    action: "resetPassword",
    body: { oobCode: "synthetic-code", newPassword: "SyntheticPassword123!" },
  });
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "INVALID_OOB_CODE" } }), { status: 400 });
  await assert.rejects(provider.verifyPasswordReset("synthetic-invalid"), (error: unknown) => {
    assert.ok(
      error instanceof Error && "code" in error && error.code === "ADMIN_RESET_LINK_INVALID",
    );
    assert.ok(!error.message.includes("INVALID_OOB_CODE"));
    assert.ok(!error.message.includes("synthetic-invalid"));
    return true;
  });
});
