import { test, expect, type Page } from "@playwright/test";

type Settings = {
  delaySms?: boolean;
  delayPersistence?: boolean;
  delayConfirm?: boolean;
  failFirstSms?: boolean;
};
type Runtime = {
  mode: string;
  active: number;
  cleared: number;
  sms: number;
  confirms: number;
  numbers: string[];
  parents: HTMLElement[];
  releaseSms?: () => void;
  releasePersistence?: () => void;
  releaseConfirm?: () => void;
};
async function fixture(page: Page, settings: Settings = {}) {
  const state = { starts: 0 };
  await page.addInitScript((options: Settings) => {
    const runtime: Runtime = {
      mode: "",
      active: 0,
      cleared: 0,
      sms: 0,
      confirms: 0,
      numbers: [],
      parents: [],
    };
    Object.assign(window, { registrationCaptcha: runtime });
    const auth = Object.assign(
      () => ({
        languageCode: "tr",
        setPersistence: async (mode: string) => {
          if (options.delayPersistence)
            await new Promise<void>((resolve) => {
              runtime.releasePersistence = resolve;
            });
          runtime.mode = mode;
        },
        signInWithPhoneNumber: async (number: string) => {
          if (runtime.mode !== "none") throw new Error("Memory-only must finish before SMS");
          runtime.sms++;
          runtime.numbers.push(number);
          if (options.delaySms)
            await new Promise<void>((resolve) => {
              runtime.releaseSms = resolve;
            });
          if (options.failFirstSms && runtime.sms === 1)
            throw { code: "auth/network-request-failed" };
          return {
            confirm: async (code: string) => {
              runtime.confirms++;
              if (options.delayConfirm)
                await new Promise<void>((resolve) => {
                  runtime.releaseConfirm = resolve;
                });
              if (code !== "123456") throw { code: "auth/invalid-verification-code" };
              return { user: { getIdToken: async () => "synthetic-registration-proof" } };
            },
          };
        },
      }),
      {
        RecaptchaVerifier: class {
          constructor(host: HTMLElement, options: { badge: string }) {
            if (
              options.badge !== "inline" ||
              !host.isConnected ||
              host.parentElement?.tagName === "BUTTON"
            )
              throw new Error("Attached independent inline host required");
            runtime.parents.push(host.parentElement!);
            const badge = document.createElement("div");
            badge.dataset.testid = "registration-badge";
            badge.textContent = "reCAPTCHA — Privacy — Terms";
            // Use real inline badge dimensions. Like the SDK, clear() leaves
            // children behind; the unchanged #63 helper owns their removal.
            Object.assign(badge.style, {
              width: "256px",
              height: "60px",
              background: "white",
              color: "black",
            });
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
  }, settings);
  await page.route("https://www.gstatic.com/firebasejs/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ status: 200, json: { success: true, data } });
    if (path.endsWith("/phone-password/status")) return ok({ enabled: true, pending: false });
    if (path.endsWith("/sms-recovery/status")) return ok({ enabled: false, pending: false });
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
      state.starts++;
      return ok({ expiresAt: new Date(Date.now() + 240000).toISOString() });
    }
    if (path.endsWith("/auth/refresh-token"))
      return route.fulfill({
        status: 401,
        json: { success: false, error: { code: "UNAUTHORIZED", message: "Synthetic no session" } },
      });
    return ok({});
  });
  return state;
}
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const r = (window as unknown as { registrationCaptcha: Runtime }).registrationCaptcha;
    return {
      mode: r.mode,
      active: r.active,
      cleared: r.cleared,
      sms: r.sms,
      confirms: r.confirms,
      numbers: r.numbers,
      attached: r.parents.map((p) => p.isConnected),
    };
  });
async function openRegistration(page: Page) {
  await page.goto("/phone-auth");
  await page.getByRole("button", { name: "Telefon ile kayıt ol / İlk şifremi oluştur" }).click();
  await page.getByLabel("Telefon numarası", { exact: true }).fill("0555 111 22 33");
}
const send = (page: Page) =>
  page.getByRole("button", { name: "SMS kodu gönder", exact: true }).click();
async function leave(page: Page) {
  // Next Link retains the document: orphan instances remain observable.
  await page.locator('header a[href="/"]').click();
  await expect(page).not.toHaveURL(/\/phone-auth$/);
}

test("independent host survives number/code and wrong-code retry; clears before password", async ({
  page,
}) => {
  const state = await fixture(page);
  await openRegistration(page);
  const host = await page.locator("#diewish-phone-password-recaptcha").elementHandle();
  await send(page);
  await expect(page.getByLabel("SMS doğrulama kodu")).toBeVisible();
  expect(
    await host!.evaluate(
      (el) => el === document.getElementById("diewish-phone-password-recaptcha"),
    ),
  ).toBe(true);
  await expect(page.getByTestId("registration-badge")).toBeVisible();
  await page.getByLabel("SMS doğrulama kodu").fill("000000");
  await page.getByRole("button", { name: "Telefonu doğrula", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("SMS kodu hatalı");
  expect((await snapshot(page)).active).toBe(1);
  await page.getByLabel("SMS doğrulama kodu").fill("123456");
  await page.getByRole("button", { name: "Telefonu doğrula", exact: true }).click();
  await expect(page.getByLabel("Şifre oluştur", { exact: true })).toBeVisible();
  await expect(page.getByTestId("registration-badge")).toHaveCount(0);
  expect(await snapshot(page)).toMatchObject({ mode: "none", active: 0, cleared: 1, sms: 1 });
  expect(state.starts).toBe(1);
});

test("number change and resend retire old attempt and preserve unrelated DOM", async ({ page }) => {
  await fixture(page);
  await openRegistration(page);
  await page.locator("#diewish-phone-password-recaptcha").evaluate((el) => {
    const sibling = document.createElement("span");
    sibling.id = "unrelated-captcha-content";
    sibling.textContent = "unrelated";
    el.append(sibling);
  });
  await send(page);
  await expect(page.getByLabel("SMS doğrulama kodu")).toBeVisible();
  await page.getByRole("button", { name: "Numarayı değiştir / Yeniden kod iste" }).click();
  await expect(page.getByTestId("registration-badge")).toHaveCount(0);
  expect(await snapshot(page)).toMatchObject({ active: 0, cleared: 1 });
  await expect(page.locator("#unrelated-captcha-content")).toBeVisible();
  await page.getByLabel("Telefon numarası", { exact: true }).fill("0555 444 55 66");
  await send(page);
  await expect(page.getByLabel("SMS doğrulama kodu")).toBeVisible();
  expect(await snapshot(page)).toMatchObject({
    active: 1,
    cleared: 1,
    sms: 2,
    numbers: ["+905551112233", "+905554445566"],
    attached: [true, true],
  });
  await expect(page.getByTestId("registration-badge")).toHaveCount(1);
  await page.getByRole("button", { name: "Telefon ve şifre ile giriş yap", exact: true }).click();
  await expect(page.getByLabel("Diewish şifreniz", { exact: true })).toBeVisible();
  expect(await snapshot(page)).toMatchObject({ active: 0, cleared: 2, sms: 2 });
});

test("failed SMS cleans its widget and retry creates one fresh attempt", async ({ page }) => {
  await fixture(page, { failFirstSms: true });
  await openRegistration(page);
  await send(page);
  await expect(page.getByRole("status")).toContainText("Giriş hizmetine ulaşılamadı");
  await expect(page.getByTestId("registration-badge")).toHaveCount(0);
  expect(await snapshot(page)).toMatchObject({ active: 0, cleared: 1, sms: 1 });
  await send(page);
  await expect(page.getByLabel("SMS doğrulama kodu")).toBeVisible();
  expect(await snapshot(page)).toMatchObject({
    active: 1,
    cleared: 1,
    sms: 2,
    attached: [true, true],
  });
});

test("leaving during pending SMS aborts fifth argument before confirmation exists", async ({
  page,
}) => {
  const state = await fixture(page, { delaySms: true });
  await openRegistration(page);
  await send(page);
  await expect(page.getByTestId("registration-badge")).toBeVisible();
  await leave(page);
  expect(await snapshot(page)).toMatchObject({ active: 0, cleared: 1, sms: 1 });
  await page.evaluate(() =>
    (window as unknown as { registrationCaptcha: Runtime }).registrationCaptcha.releaseSms!(),
  );
  await expect(page.getByTestId("registration-badge")).toHaveCount(0);
  expect(state.starts).toBe(0);
});

test("leaving before persistence resolves creates no later widget or SMS", async ({ page }) => {
  await fixture(page, { delayPersistence: true });
  await openRegistration(page);
  await send(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { registrationCaptcha: Runtime }).registrationCaptcha
            .releasePersistence,
      ),
    )
    .toBe("function");
  await leave(page);
  await page.evaluate(() =>
    (window as unknown as { registrationCaptcha: Runtime }).registrationCaptcha
      .releasePersistence!(),
  );
  expect(await snapshot(page)).toMatchObject({ active: 0, cleared: 0, sms: 0 });
  await expect(page.getByTestId("registration-badge")).toHaveCount(0);
});

test("leaving during code confirmation clears widget and ignores late result", async ({ page }) => {
  const state = await fixture(page, { delayConfirm: true });
  await openRegistration(page);
  await send(page);
  await page.getByLabel("SMS doğrulama kodu").fill("123456");
  await page.getByRole("button", { name: "Telefonu doğrula", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).confirms).toBe(1);
  await leave(page);
  expect(await snapshot(page)).toMatchObject({ active: 0, cleared: 1 });
  await page.evaluate(() =>
    (window as unknown as { registrationCaptcha: Runtime }).registrationCaptcha.releaseConfirm!(),
  );
  expect(state.starts).toBe(0);
  await expect(page.getByTestId("registration-badge")).toHaveCount(0);
});

test("full inline badge fits mobile light/dark and stays attached", async ({ page }, testInfo) => {
  await fixture(page);
  await openRegistration(page);
  await send(page);
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const badge = page.getByTestId("registration-badge");
      await expect(badge).toBeVisible();
      const box = await badge.boundingBox();
      expect(box?.width).toBe(256);
      expect(box?.height).toBe(60);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  await testInfo.attach("registration-inline-badge", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  expect(await snapshot(page)).toMatchObject({ active: 1, cleared: 0, attached: [true] });
});
