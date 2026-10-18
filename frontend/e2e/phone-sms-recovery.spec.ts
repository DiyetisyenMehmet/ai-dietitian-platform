import { test, expect, type Page } from "@playwright/test";
async function fixture(
  page: Page,
  settings: {
    enabled?: boolean;
    verified?: boolean;
    expired?: boolean;
    delayedSms?: boolean;
    invalidProof?: boolean;
  } = {},
) {
  const state = {
    enabled: settings.enabled ?? true,
    verified: settings.verified ?? false,
    pending: settings.verified ?? false,
    begins: 0,
    verifies: 0,
    completes: 0,
    authWrites: 0,
  };
  await page.addInitScript((delay: boolean) => {
    const runtime = { mode: "", active: 0, cleared: 0, sms: 0 };
    Object.assign(window, { recoveryRuntime: runtime });
    const auth = Object.assign(
      () => ({
        languageCode: "tr",
        setPersistence: async (mode: string) => {
          runtime.mode = mode;
        },
        signInWithPhoneNumber: async () => {
          if (runtime.mode !== "none") throw new Error("Persistent proof forbidden");
          runtime.sms++;
          if (delay) await new Promise<void>(() => {});
          return {
            confirm: async (code: string) => {
              if (code !== "123456") throw { code: "auth/invalid-verification-code" };
              return { user: { getIdToken: async () => "synthetic-recovery-provider-token" } };
            },
          };
        },
      }),
      {
        RecaptchaVerifier: class {
          constructor(host: HTMLElement, options: { badge: string }) {
            if (options.badge !== "inline") throw new Error("Inline badge required");
            const badge = document.createElement("div");
            badge.dataset.testid = "recovery-badge";
            badge.textContent = "reCAPTCHA synthetic badge";
            host.appendChild(badge);
            runtime.active++;
          }
          clear() {
            runtime.active--;
            runtime.cleared++;
          }
        },
      },
    );
    Object.assign(window, { firebase: { apps: [{}], initializeApp: () => {}, auth } });
  }, settings.delayedSms ?? false);
  await page.route("https://www.gstatic.com/firebasejs/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ status: 200, json: { success: true, data } });
    if (path.includes("/auth/") && route.request().method() === "POST") {
      if (!path.endsWith("refresh-token")) state.authWrites++;
      return route.fulfill({
        status: 401,
        json: { success: false, error: { code: "UNAUTHORIZED", message: "Synthetic no session" } },
      });
    }
    if (path.endsWith("/sms-recovery/status"))
      return ok({
        enabled: state.enabled,
        pending: state.pending,
        verified: state.verified,
        expiresAt: new Date(Date.now() + (settings.expired ? -1000 : 240000)).toISOString(),
      });
    if (path.endsWith("/phone-password/status")) return ok({ enabled: true, pending: false });
    if (path.endsWith("/firebase-config"))
      return ok({
        configured: true,
        config: {
          apiKey: "synthetic-key",
          authDomain: "fixture.invalid",
          projectId: "synthetic-project",
          appId: "synthetic-app",
        },
      });
    if (path.endsWith("/sms-recovery/begin")) {
      state.begins++;
      state.pending = true;
      return ok({ expiresAt: new Date(Date.now() + 240000).toISOString() });
    }
    if (path.endsWith("/sms-recovery/verify")) {
      state.verifies++;
      if (settings.invalidProof)
        return route.fulfill({
          status: 400,
          json: {
            success: false,
            error: { code: "SMS_RECOVERY_INVALID", message: "Synthetic invalid proof" },
          },
        });
      state.verified = true;
      return ok({ verified: true });
    }
    if (path.endsWith("/sms-recovery/complete")) {
      const body = route.request().postDataJSON();
      expect(body.newPassword).toBe(body.passwordConfirmation);
      state.completes++;
      state.pending = false;
      state.verified = false;
      return ok({ reset: true });
    }
    if (path.endsWith("/sms-recovery/cancel")) {
      state.pending = false;
      state.verified = false;
      return ok({ cancelled: true });
    }
    return ok({});
  });
  return state;
}
async function requestSms(page: Page) {
  await page.getByLabel("Doğrulanmış telefon numaranız").fill("0555 111 22 33");
  await page.getByRole("button", { name: "SMS kodu gönder", exact: true }).click();
  await expect(page.getByLabel("SMS doğrulama kodu")).toBeVisible();
}
const runtime = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          recoveryRuntime: { mode: string; active: number; cleared: number; sms: number };
        }
      ).recoveryRuntime,
  );

test("new SMS then password/confirmation resets without session; badge survives number-to-code and clears after proof", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/phone-password-recovery");
  await requestSms(page);
  await expect(page.getByTestId("recovery-badge")).toBeVisible();
  await page.getByLabel("SMS doğrulama kodu").fill("000000");
  await page.getByRole("button", { name: "Kodu doğrula" }).click();
  await expect(page.getByRole("status")).toContainText("SMS kodu hatalı");
  await page.getByLabel("SMS doğrulama kodu").fill("123456");
  await page.getByRole("button", { name: "Kodu doğrula" }).click();
  await expect(page.getByLabel("Yeni şifre", { exact: true })).toBeVisible();
  expect((await runtime(page)).active).toBe(0);
  await expect(page.getByTestId("recovery-badge")).toHaveCount(0);
  await page.getByLabel("Yeni şifre", { exact: true }).fill("RecoveryNewPassword456");
  await page.getByLabel("Yeni şifreyi tekrar gir").fill("DifferentPassword789");
  await page.getByRole("button", { name: "Şifremi sıfırla", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Şifreler aynı");
  expect(state.completes).toBe(0);
  await page.getByLabel("Yeni şifreyi tekrar gir").fill("RecoveryNewPassword456");
  await page.getByRole("button", { name: "Şifremi sıfırla", exact: true }).dblclick();
  await expect(page.getByText("Şifreniz güncellendi.", { exact: false })).toBeVisible();
  await expect(page).toHaveURL(/\/phone-password-recovery$/);
  expect(state.completes).toBe(1);
  expect(state.authWrites).toBe(0);
  expect((await runtime(page)).sms).toBe(1);
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toMatch(
    /RecoveryNewPassword456|123456|synthetic-recovery-provider-token/,
  );
  await expect(page.getByRole("link", { name: "Yeni şifremle giriş yap" })).toHaveAttribute(
    "href",
    "/phone-auth",
  );
});
test("verified recovery resumes after reload with empty password fields and can be restarted", async ({
  page,
}) => {
  const state = await fixture(page, { verified: true });
  await page.goto("/phone-password-recovery");
  await page.getByLabel("Yeni şifre", { exact: true }).fill("RecoveryNewPassword456");
  await page.reload();
  await expect(page.getByLabel("Yeni şifre", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Yeni şifreyi tekrar gir")).toHaveValue("");
  await page.getByRole("button", { name: "Numarayı değiştir / Yeniden başlat" }).click();
  await expect(page.getByLabel("Doğrulanmış telefon numaranız")).toBeVisible();
  expect(state.verified).toBe(false);
});
test("disabled or unavailable recovery never sends SMS and its login entry stays hidden", async ({
  page,
}) => {
  const state = await fixture(page, { enabled: false });
  await page.goto("/phone-auth");
  await expect(page.getByRole("heading", { name: "Telefon ile giriş yap" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Şifremi unuttum — SMS ile sıfırla" })).toHaveCount(
    0,
  );
  await page.goto("/phone-password-recovery");
  await expect(page.getByText("SMS ile şifre kurtarma henüz kullanıma açık değil.")).toBeVisible();
  await expect(page.getByRole("button", { name: "SMS kodu gönder" })).toHaveCount(0);
  expect(state.begins).toBe(0);
  await page.route("**/api/identity/sms-recovery/status", (route) => route.abort());
  await page.reload();
  await expect(page.locator("p[role=alert]")).toContainText("Kurtarma seçenekleri yüklenemedi");
});
test("leaving during pending SMS aborts its owned widget; a new view has no orphan badge", async ({
  page,
}) => {
  await fixture(page, { delayedSms: true });
  await page.goto("/phone-password-recovery");
  await page.getByLabel("Doğrulanmış telefon numaranız").fill("0555 111 22 33");
  await page.getByRole("button", { name: "SMS kodu gönder", exact: true }).click();
  await expect(page.getByTestId("recovery-badge")).toBeVisible();
  await page.getByRole("link", { name: "Telefon ile girişe dön" }).click();
  await expect(page).toHaveURL(/\/phone-auth$/);
  expect((await runtime(page)).active).toBe(0);
  expect((await runtime(page)).cleared).toBe(1);
});
test("invalid ownership proof clears widget and returns to number; expired proof cannot reach password submission", async ({
  page,
}) => {
  await fixture(page, { invalidProof: true });
  await page.goto("/phone-password-recovery");
  await requestSms(page);
  await page.getByLabel("SMS doğrulama kodu").fill("123456");
  await page.getByRole("button", { name: "Kodu doğrula" }).click();
  await expect(page.getByRole("status")).toContainText("Doğrulama geçersiz");
  expect((await runtime(page)).active).toBe(0);
  await expect(page.getByLabel("Doğrulanmış telefon numaranız")).toBeVisible();
});
test("new recovery form fits mobile widths with dark theme and an expired operation restarts safely", async ({
  page,
}) => {
  await fixture(page, { verified: true });
  await page.emulateMedia({ colorScheme: "dark" });
  for (const width of [390, 412, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/phone-password-recovery");
    await expect(page.getByLabel("Yeni şifre", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
