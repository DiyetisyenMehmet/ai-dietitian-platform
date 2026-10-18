import { test, expect } from "@playwright/test";

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const STATUS_ROUTE = "**/api/identity/phone-password/status";
const providerTraffic = new WeakMap();
const country = (page, name = "Türkiye", prefix = "90") =>
  page.getByRole("button", { name: new RegExp(`Seçili ülke ${name}, \\+${prefix}`) });
const statusResponse = (enabled) => ({
  status: 200,
  json: { success: true, data: { enabled, pending: false } },
});

async function phoneStatus(page, enabled) {
  // This UI-only suite has no API server. Model the feature gate explicitly;
  // do not weaken the real page's loading/error behavior to satisfy the test.
  await page.route(STATUS_ROUTE, (route) => route.fulfill(statusResponse(enabled)));
  await page.route("**/api/identity/sms-recovery/status", (route) =>
    route.fulfill({
      status: 200,
      json: { success: true, data: { enabled: false, pending: false } },
    }),
  );
}

async function expectLegacyPhoneForm(page) {
  await expect(page.getByRole("heading", { name: "Telefon ile devam et" })).toBeVisible();
  await expect(page.getByRole("status")).not.toHaveText("Giriş seçenekleri yükleniyor...");
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
  await expect(country(page)).toBeVisible();
  await expect(page.getByLabel("Telefon numarası", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "SMS kodu gönder", exact: true })).toBeVisible();
  await expect(page.getByLabel("Diewish şifreniz", { exact: true })).toHaveCount(0);
}

// No case sends SMS or supplies a provider proof. Observe and block accidental
// provider traffic so this file remains safe in both frontend-only and API CI.
test.beforeEach(async ({ page }) => {
  const providerRequests = [];
  await page.route("https://www.gstatic.com/firebasejs/**", (route) => {
    providerRequests.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/identity/firebase-config", (route) => {
    providerRequests.push(route.request().url());
    return route.abort();
  });
  providerTraffic.set(page, providerRequests);
});
test.afterEach(async ({ page }) => {
  expect(providerTraffic.get(page)).toEqual([]);
});

test("login identity entry points are branded and phone navigation is actionable", async ({
  page,
}) => {
  await phoneStatus(page, false);
  await page.goto(`${WEB_BASE_URL}/login`);

  const google = page.getByRole("button", { name: "Google ile devam et" });
  await expect(google).toBeVisible();
  await expect(google.locator('[data-testid="google-brand-icon"]')).toBeVisible();

  const phone = page.getByRole("button", { name: "Telefon numarası ile devam et" });
  await expect(phone).toBeVisible();
  await phone.click();

  await expect(page).toHaveURL(/\/phone-auth$/);
  await expectLegacyPhoneForm(page);
  await country(page).click();
  await page.getByLabel("Ülke ara").fill("Almanya");
  await page.getByRole("option", { name: /Almanya.*\+49/ }).click();
  await expect(country(page, "Almanya", "49")).toBeVisible();
});

test("phone form waits for status before rendering the default-off legacy entry", async ({
  page,
}) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const requested = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/identity/phone-password/status",
  );
  await page.route(STATUS_ROUTE, async (route) => {
    await gate;
    await route.fulfill(statusResponse(false));
  });
  try {
    await page.goto(`${WEB_BASE_URL}/phone-auth`);
    await requested;
    await expect(page.getByRole("status")).toHaveText("Giriş seçenekleri yükleniyor...");
    await expect(country(page)).toHaveCount(0);
    await expect(page.getByLabel("Telefon numarası", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "SMS kodu gönder", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Diewish şifreniz", { exact: true })).toHaveCount(0);
    release();
    await expectLegacyPhoneForm(page);
  } finally {
    release();
  }
});

for (const failure of ["http", "network"]) {
  test(`phone status ${failure} failure stays closed; reload recovers after a successful status`, async ({
    page,
  }) => {
    await page.route(STATUS_ROUTE, (route) =>
      failure === "network"
        ? route.abort("failed")
        : route.fulfill({
            status: 503,
            json: {
              success: false,
              error: { code: "TEST_UNAVAILABLE", message: "Synthetic unavailable" },
            },
          }),
    );
    await page.goto(`${WEB_BASE_URL}/phone-auth`);
    await expect(page.locator("p[role=alert]")).toContainText("Giriş seçenekleri yüklenemedi");
    await expect(country(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "SMS kodu gönder", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Giriş yap", exact: true })).toHaveCount(0);
    await page.unroute(STATUS_ROUTE);
    await phoneStatus(page, false);
    await page.reload();
    await expectLegacyPhoneForm(page);
  });
}

test("enabled status selects shared-password login and registration entry without sending SMS", async ({
  page,
}) => {
  await phoneStatus(page, true);
  await page.goto(`${WEB_BASE_URL}/phone-auth`);
  await expect(
    page.getByRole("heading", { name: "Telefon ile giriş yap", exact: true }),
  ).toBeVisible();
  await expect(country(page)).toBeVisible();
  await expect(page.getByLabel("Diewish şifreniz", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Giriş yap", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "SMS kodu gönder", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Telefon ile kayıt ol / İlk şifremi oluştur" }).click();
  await expect(
    page.getByRole("heading", { name: "Telefon ile kayıt ol", exact: true }),
  ).toBeVisible();
  await expect(country(page)).toBeVisible();
  await expect(page.getByLabel("Diewish şifreniz", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "SMS kodu gönder", exact: true })).toBeVisible();
  await expect(page.locator("#diewish-phone-password-recaptcha")).toHaveCount(1);
  await page.getByRole("button", { name: "Telefon ve şifre ile giriş yap", exact: true }).click();
  await expect(page.getByLabel("Diewish şifreniz", { exact: true })).toBeVisible();
  await expect(page.locator("#diewish-phone-password-recaptcha")).toHaveCount(0);
});
