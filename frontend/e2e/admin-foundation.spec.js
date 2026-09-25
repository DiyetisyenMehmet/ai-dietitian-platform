const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test, expect } = require("@playwright/test");

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const API_BASE_URL = process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api";

async function registerInBrowser(page, label) {
  const email = `admin.e2e.${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;
  const password = "AdminE2EPass123";

  await page.goto(`${WEB_BASE_URL}/register`);
  await page.getByLabel("Ad Soyad").fill(`Admin E2E ${label}`);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByLabel("Şifre (Tekrar)").fill(password);
  await page.getByRole("button", { name: "Hesap Oluştur" }).click();
  await expect(page).toHaveURL(/\/consent$/);

  return { email, password };
}

async function resolveUserId(request, credentials) {
  const login = await request.post(`${API_BASE_URL}/auth/login`, {
    data: credentials,
  });
  expect(login.status()).toBe(200);
  const body = await login.json();
  return body.data.user.id;
}

function bootstrapAdmin(userId) {
  execFileSync("npm", ["run", "admin:bootstrap"], {
    cwd: path.resolve(process.cwd(), "../backend"),
    env: {
      ...process.env,
      DIEWISH_ENVIRONMENT: "test",
      ADMIN_BOOTSTRAP_USER_ID: userId,
      ADMIN_BOOTSTRAP_CONFIRM: "DIEWISH_STAGING_ADMIN_BOOTSTRAP",
    },
    stdio: "pipe",
  });
}

test("normal user cannot render Management Center content", async ({ page }) => {
  await registerInBrowser(page, "normal");
  await page.goto(`${WEB_BASE_URL}/admin`);

  await expect(page.getByRole("heading", { name: "Erişim reddedildi" })).toBeVisible();
  await expect(page.getByText("Yönetim merkezi hazır")).toHaveCount(0);
});

test("authorized admin sees shell and backend environment identity", async ({ page, request }) => {
  const credentials = await registerInBrowser(page, "admin");
  const userId = await resolveUserId(request, credentials);
  bootstrapAdmin(userId);

  // Full navigation rebuilds the in-memory auth store and obtains a fresh
  // access token whose coarse role matches the just-bootstrapped DB principal.
  await page.goto(`${WEB_BASE_URL}/admin`);

  await expect(page.getByText("Diewish Management Center", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yönetim merkezi hazır" })).toBeVisible();
  await expect(page.getByTestId("admin-environment-banner")).toHaveText("TEST");
  await expect(page.getByText("Access / Security", { exact: true })).toBeVisible();
  await expect(page.getByText(/Kullanıcı veya abonelik operasyonları henüz açık değildir/)).toBeVisible();
});

test("auth loading never flashes admin content", async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  await page.route("**/api/auth/refresh-token", async (route) => {
    await gate;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required." },
      }),
    });
  });

  await page.goto(`${WEB_BASE_URL}/admin`);
  await expect(page.getByLabel("Yükleniyor")).toBeVisible();
  await expect(page.getByText("Diewish Management Center", { exact: true })).toHaveCount(0);

  release();
  await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
});


test("admin staging hostname is isolated from normal app routes", async ({ request }) => {
  const headers = { "x-forwarded-host": "admin-staging.diewish.com" };

  const root = await request.get(`${WEB_BASE_URL}/`, {
    headers,
    maxRedirects: 0,
  });
  expect([307, 308]).toContain(root.status());
  expect(new URL(root.headers().location).pathname).toBe("/admin");

  const login = await request.get(`${WEB_BASE_URL}/login`, {
    headers,
    maxRedirects: 0,
  });
  expect([307, 308]).toContain(login.status());
  expect(new URL(login.headers().location).pathname).toBe("/admin/login");

  const dashboard = await request.get(`${WEB_BASE_URL}/dashboard`, {
    headers,
    maxRedirects: 0,
  });
  expect([307, 308]).toContain(dashboard.status());
  expect(new URL(dashboard.headers().location).pathname).toBe("/admin");

  const adminLogin = await request.get(`${WEB_BASE_URL}/admin/login`, {
    headers,
    maxRedirects: 0,
  });
  expect(adminLogin.status()).toBe(200);
});

test("production admin hostname fails closed", async ({ request }) => {
  const response = await request.get(`${WEB_BASE_URL}/admin`, {
    headers: { "x-forwarded-host": "admin.diewish.com" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(404);
});


test("admin login uses one blank identifier field for email or phone", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/login`);

  const identifier = page.getByLabel("E-posta veya telefon");
  await expect(identifier).toBeVisible();
  await expect(identifier).toHaveValue("");
  expect(await identifier.getAttribute("placeholder")).toBeNull();

  await identifier.fill("admin@example.com");
  await page.getByRole("button", { name: "Devam Et" }).click();
  await expect(page.getByRole("textbox", { name: "Şifre", exact: true })).toBeVisible();
  await expect(page.getByLabel("E-posta veya telefon")).toHaveCount(0);
});
