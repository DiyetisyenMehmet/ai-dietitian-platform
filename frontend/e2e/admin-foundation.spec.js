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

test("normal user is returned to a clean Admin login screen", async ({ page }) => {
  await registerInBrowser(page, "normal");
  await page.goto(`${WEB_BASE_URL}/admin`);

  await expect(page).toHaveURL(/\/admin\/login$/, { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Management Center" })).toBeVisible();
  await expect(page.getByText("Bu hesap Yönetim Merkezi için yetkili değil.")).toHaveCount(0);
  await expect(page.getByLabel("E-posta veya telefon")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Erişim reddedildi" })).toHaveCount(0);
  await expect(page.getByText("Yönetim merkezi hazır")).toHaveCount(0);
});

test("Admin login recovers from an existing normal Diewish session", async ({ page }) => {
  await registerInBrowser(page, "stale-normal-session");
  await page.goto(`${WEB_BASE_URL}/admin/login`);

  await expect(page).toHaveURL(/\/admin\/login$/, { timeout: 10_000 });
  await expect(page.getByLabel("E-posta veya telefon")).toBeVisible();
  await expect(page.getByText("Bu hesap Yönetim Merkezi için yetkili değil.")).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel("E-posta veya telefon")).toBeVisible();
  await expect(page.getByText("Bu hesap Yönetim Merkezi için yetkili değil.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Erişim reddedildi" })).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: "Hesap ve güvenlik" })).toBeVisible();
  await expect(page.getByText("E-posta değiştir", { exact: true })).toBeVisible();
  await expect(page.getByText("Şifre değiştir", { exact: true })).toBeVisible();
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
  await expect(identifier).toHaveAttribute("placeholder", "Yönetici hesabınız");

  await page.route("**/api/admin/auth/identifier", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { accepted: true } }),
    });
  });
  await identifier.fill("admin@example.com");
  await page.getByRole("button", { name: "Devam Et" }).click();
  await expect(page.getByRole("textbox", { name: "Şifre", exact: true })).toBeVisible();
  await expect(page.getByLabel("E-posta veya telefon")).toHaveCount(0);
});


test("Admin login hides explanatory access copy", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/login`);
  await expect(page.getByText("Yalnızca yetkili yönetici hesapları içindir.")).toHaveCount(0);
  await expect(page.getByText(/Yetki kontrolü backend üzerinde/)).toHaveCount(0);
  await expect(page.getByText("E-posta veya telefon", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("E-posta veya telefon")).toBeVisible();
});


test("Admin login uses a discreet professional identifier prompt", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/login`);
  const identifier = page.getByLabel("E-posta veya telefon");
  await expect(identifier).toHaveAttribute("placeholder", "Yönetici hesabınız");
  await expect(page.getByText("Yönetici hesabınız", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/örnek@|example@/i)).toHaveCount(0);
});


test("blank Admin login never shows a stale authorization warning", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/login?notice=access-denied`);
  await expect(page.getByLabel("E-posta veya telefon")).toHaveValue("");
  await expect(page.getByText("Bu hesap Yönetim Merkezi için yetkili değil.")).toHaveCount(0);
});


test("Admin login rejects malformed identifiers before any auth step", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/login`);
  const identifier = page.getByLabel("E-posta veya telefon");

  for (const value of ["admin", "admin@", "0532", "+90 abc"]) {
    await identifier.fill(value);
    await page.getByRole("button", { name: "Devam Et" }).click();
    await expect(page.getByText("Geçerli bir yönetici hesabı girin.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Şifre", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("SMS doğrulama kodu")).toHaveCount(0);
  }
});

test("Admin login does not advance an unapproved valid email to the password step", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/login`);
  await page.getByLabel("E-posta veya telefon").fill("not-a-known-admin-account@gmail.com");
  await page.getByRole("button", { name: "Devam Et" }).click();
  await expect(page.getByText("Bu yönetici hesabı doğrulanamadı.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Şifre", exact: true })).toHaveCount(0);
});


test("Admin login routes a valid Turkish mobile number to SMS verification", async ({ page }) => {
  await page.route("**/api/identity/firebase-config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          configured: true,
          config: {
            apiKey: "test-api-key",
            authDomain: "admin-staging.diewish.com",
            projectId: "test-project",
            appId: "test-app",
          },
        },
      }),
    });
  });

  const firebaseStub = `
    (() => {
      const authFactory = function () {
        return {
          languageCode: null,
          signInWithPopup: async () => ({ user: { getIdToken: async () => "token" } }),
          signInWithPhoneNumber: async () => ({
            confirm: async () => ({ user: { getIdToken: async () => "phone-token" } }),
          }),
        };
      };
      authFactory.GoogleAuthProvider = class {};
      authFactory.OAuthProvider = class { addScope() {} };
      authFactory.RecaptchaVerifier = class { clear() {} };
      window.firebase = {
        apps: [],
        initializeApp() { this.apps.push({}); },
        auth: authFactory,
      };
    })();
  `;

  await page.route("https://www.gstatic.com/firebasejs/**/firebase-app-compat.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: firebaseStub });
  });
  await page.route("https://www.gstatic.com/firebasejs/**/firebase-auth-compat.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });

  await page.route("**/api/admin/auth/identifier", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { accepted: true } }),
    });
  });

  await page.goto(`${WEB_BASE_URL}/admin/login`);
  await page.getByLabel("E-posta veya telefon").fill("0532 123 45 67");
  await page.getByRole("button", { name: "Devam Et" }).click();

  await expect(page.getByLabel("SMS doğrulama kodu")).toBeVisible();
  await expect(page.getByText("Doğrulama kodu gönderildi.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Şifre", exact: true })).toHaveCount(0);
});
