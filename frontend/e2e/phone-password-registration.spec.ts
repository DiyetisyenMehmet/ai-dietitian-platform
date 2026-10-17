import { test, expect, type Page } from "@playwright/test";

async function fixture(page: Page, options: { enabled?: boolean; pending?: boolean } = {}) {
  const state = {
    pending: options.pending ?? false,
    loginCalls: 0,
    completeCalls: 0,
    startCalls: 0,
    cancelled: 0,
  };
  await page.addInitScript(() => {
    const auth = Object.assign(
      () => ({
        languageCode: "tr",
        signInWithPhoneNumber: async () => {
          (window as unknown as { smsCalls: number }).smsCalls =
            ((window as unknown as { smsCalls: number }).smsCalls || 0) + 1;
          return {
            confirm: async (code: string) => {
              if (code !== "123456") throw { code: "auth/invalid-verification-code" };
              return { user: { getIdToken: async () => "synthetic-firebase-proof-only" } };
            },
          };
        },
      }),
      {
        GoogleAuthProvider: class {},
        RecaptchaVerifier: class {
          clear() {}
        },
      },
    );
    Object.assign(window, { firebase: { apps: [{}], initializeApp: () => {}, auth } });
  });
  await page.route("https://www.gstatic.com/firebasejs/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = route.request().postData() ? route.request().postDataJSON() : {};
    const ok = (value: unknown) =>
      route.fulfill({ status: 200, json: { success: true, data: value } });
    const error = (status: number, code: string) =>
      route.fulfill({
        status,
        json: { success: false, error: { code, message: "Synthetic rejected request" } },
      });
    if (path.endsWith("/phone-password/status"))
      return ok({
        enabled: options.enabled ?? true,
        pending: state.pending,
        expiresAt: new Date(Date.now() + 240000).toISOString(),
      });
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
    if (path.endsWith("/phone-password/start")) {
      state.startCalls++;
      state.pending = true;
      return ok({ expiresAt: new Date(Date.now() + 240000).toISOString() });
    }
    if (path.endsWith("/phone-password/cancel")) {
      state.cancelled++;
      state.pending = false;
      return ok({ cancelled: true });
    }
    if (path.endsWith("/phone-password/complete")) {
      state.completeCalls++;
      expect(data.password).toBe(data.passwordConfirmation);
      state.pending = false;
      return ok(session());
    }
    if (path.endsWith("/phone-password/login")) {
      state.loginCalls++;
      if (data.password === "WrongPassword123") return error(401, "UNAUTHORIZED");
      return ok(session(true));
    }
    if (path.endsWith("/auth/refresh-token")) return error(401, "UNAUTHORIZED");
    if (path.endsWith("/auth/me")) return ok({ user: session().user });
    if (path.includes("consent"))
      return ok({ allMandatoryGranted: false, documents: [], consents: [] });
    return ok({});
  });
  return state;
}
function session(onboardingCompleted = false) {
  return {
    user: {
      id: "00000000-0000-4000-8000-000000000003",
      email: null,
      fullName: null,
      role: "USER",
      isActive: true,
      emailVerified: false,
      onboardingCompleted,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    tokens: { accessToken: "synthetic-access-only", tokenType: "Bearer", expiresIn: "15m" },
  };
}

test("new phone SMS -> password/confirmation -> consent; resume stores no form secrets", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/phone-auth");
  await expect(page.getByRole("heading", { name: "Telefon ile giriş yap" })).toBeVisible();
  await page.getByRole("button", { name: "Telefon ile kayıt ol / İlk şifremi oluştur" }).click();
  await page.getByLabel("Telefon numarası", { exact: true }).fill("0555 111 22 33");
  await page.getByRole("button", { name: "SMS kodu gönder", exact: true }).click();
  await page.getByLabel("SMS doğrulama kodu").fill("000000");
  await page.getByRole("button", { name: "Telefonu doğrula", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/kod|Kod/);
  await page.getByLabel("SMS doğrulama kodu").fill("123456");
  await page.getByRole("button", { name: "Telefonu doğrula", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diewish şifrenizi oluşturun" })).toBeVisible();
  expect(state.startCalls).toBe(1);
  await page.getByLabel("Şifre oluştur", { exact: true }).fill("SyntheticPhone123");
  await page.getByLabel("Şifreyi tekrar gir", { exact: true }).fill("MismatchPhone123");
  await page.getByRole("button", { name: "Şifremi kaydet ve devam et" }).click();
  await expect(page.getByRole("status")).toContainText("Şifreler aynı olmalıdır");
  expect(state.completeCalls).toBe(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Diewish şifrenizi oluşturun" })).toBeVisible();
  await expect(page.getByLabel("Şifre oluştur", { exact: true })).toHaveValue("");
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toMatch(
    /SyntheticPhone123|MismatchPhone123|123456|synthetic-firebase-proof/,
  );
  await page.getByLabel("Şifre oluştur", { exact: true }).fill("SyntheticPhone123");
  await page.getByLabel("Şifreyi tekrar gir", { exact: true }).fill("SyntheticPhone123");
  await page.getByRole("button", { name: "Şifremi kaydet ve devam et" }).dblclick();
  await expect(page).toHaveURL(/\/consent$/);
  expect(state.completeCalls).toBe(1);
});

test("normal phone/password login invokes no SMS; wrong credentials remain retryable", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/phone-auth");
  await page.getByLabel("Telefon numarası", { exact: true }).fill("0555 111 22 33");
  await page.getByLabel("Diewish şifreniz", { exact: true }).fill("WrongPassword123");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Telefon numarası veya şifre hatalı");
  await expect(page.getByLabel("Diewish şifreniz", { exact: true })).toHaveValue("");
  expect(state.startCalls).toBe(0);
  expect(
    await page.evaluate(() => (window as unknown as { smsCalls?: number }).smsCalls ?? 0),
  ).toBe(0);
  await page.getByLabel("Diewish şifreniz", { exact: true }).fill("SyntheticPhone123");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|consent)$/);
  expect(state.loginCalls).toBe(2);
});

test("pending setup can be cancelled; mobile widths and dark theme fit", async ({ page }) => {
  const state = await fixture(page, { pending: true });
  await page.emulateMedia({ colorScheme: "dark" });
  for (const width of [390, 412, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/phone-auth");
    await expect(page.getByRole("heading", { name: "Diewish şifrenizi oluşturun" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Telefon ve şifre ile giriş yap", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Telefon ile giriş yap" })).toBeVisible();
  expect(state.cancelled).toBe(1);
});

test("default-off preserves legacy SMS UI; config error fails closed", async ({ page }) => {
  await fixture(page, { enabled: false });
  await page.goto("/phone-auth");
  await expect(page.getByRole("button", { name: "SMS kodu gönder", exact: true })).toBeVisible();
  await page.route("**/api/identity/phone-password/status", (route) => route.abort());
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Giriş seçenekleri yüklenemedi");
  await expect(page.getByRole("button", { name: "SMS kodu gönder", exact: true })).toHaveCount(0);
});
