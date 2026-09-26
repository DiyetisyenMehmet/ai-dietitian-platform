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
  await expect(page.getByLabel("Yönetici hesabınız")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Erişim reddedildi" })).toHaveCount(0);
  await expect(page.getByText("Yönetim merkezi hazır")).toHaveCount(0);
});

test("Admin login recovers from an existing normal Diewish session", async ({ page }) => {
  await registerInBrowser(page, "stale-normal-session");
  await page.goto(`${WEB_BASE_URL}/admin/login`);

  await expect(page).toHaveURL(/\/admin\/login$/, { timeout: 10_000 });
  await expect(page.getByLabel("Yönetici hesabınız")).toBeVisible();
  await expect(page.getByText("Bu hesap Yönetim Merkezi için yetkili değil.")).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel("Yönetici hesabınız")).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Yönetim merkezi" })).toBeVisible();
  await expect(page.getByTestId("admin-environment-banner")).toHaveText("TEST");
  await expect(page.getByText("Access & Security", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hesap ve güvenlik" })).toBeVisible();
  await expect(page.getByText("E-posta değiştir", { exact: true })).toBeVisible();
  await expect(page.getByText("Şifre değiştir", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Access & Security" }).click();
  await expect(page).toHaveURL(/\/admin\/access$/);
  await expect(page.getByRole("heading", { name: "Yetkili çalışanlar" })).toBeVisible();
  await expect(page.getByText("Administrators", { exact: true })).toBeVisible();
  await expect(page.getByText(credentials.email, { exact: true })).toBeVisible();
  await expect(page.getByText("Yeni çalışan davet et", { exact: true })).toBeVisible();
  await expect(page.getByText("Özel görevler", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "İşlem Geçmişi" }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(page.getByRole("heading", { name: "İşlem geçmişi" })).toBeVisible();
  await expect(page.getByText("Filtreler", { exact: true })).toBeVisible();
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


test("Admin bootstrap sends an owner setup link without exposing passwords or codes", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/bootstrap`);

  await expect(page.getByRole("heading", { name: "İlk Yönetici Kurulumu" })).toBeVisible();
  const email = page.getByLabel("Yönetici e-postası");
  await expect(email).toHaveValue("");
  await expect(page.getByLabel(/şifre/i)).toHaveCount(0);
  await expect(page.getByText(/kurulum kodu/i)).toHaveCount(0);

  let payload = null;
  await page.route("**/api/admin/auth/bootstrap", async (route) => {
    payload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { message: "Hesap uygunsa kurulum bağlantısı e-posta adresine gönderildi." },
      }),
    });
  });

  await email.fill("owner@example.com");
  await page.getByRole("button", { name: "Kurulum bağlantısı gönder" }).click();
  expect(payload).toEqual({ email: "owner@example.com" });
  await expect(page.getByRole("status")).toContainText("kurulum bağlantısı");
});


test("admin login keeps email and password on one screen", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/login`);
  const email = page.getByLabel("Yönetici hesabınız");
  const password = page.getByLabel("Şifreniz");
  await expect(email).toBeVisible();
  await expect(password).toBeVisible();
  await expect(email).toHaveValue("");
  await expect(password).toHaveValue("");
  await expect(page.getByRole("button", { name: "Devam Et" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Giriş Yap" })).toBeVisible();
});


test("Admin login hides explanatory access copy", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/login`);
  await expect(page.getByText("Yalnızca yetkili yönetici hesapları içindir.")).toHaveCount(0);
  await expect(page.getByText(/Yetki kontrolü backend üzerinde/)).toHaveCount(0);
  await expect(page.getByText("E-posta veya telefon", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Yönetici hesabınız")).toBeVisible();
});


test("Admin login uses a discreet professional identifier prompt", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/login`);
  const identifier = page.getByLabel("Yönetici hesabınız");
  await expect(identifier).toHaveAttribute("placeholder", "Yönetici hesabınız");
  await expect(page.getByText("Yönetici hesabınız", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/örnek@|example@/i)).toHaveCount(0);
});


test("blank Admin login never shows a stale authorization warning", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/login?notice=access-denied`);
  await expect(page.getByLabel("Yönetici hesabınız")).toHaveValue("");
  await expect(page.getByText("Bu hesap Yönetim Merkezi için yetkili değil.")).toHaveCount(0);
});


test("unknown admin email does not reveal account existence", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/login`);
  await page.getByLabel("Yönetici hesabınız").fill("not-a-known-admin-account@gmail.com");
  await page.getByLabel("Şifreniz").fill("NotARealAdminPassword123!");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page.getByRole("status")).toHaveText("Giriş bilgileri doğrulanamadı.");
  await expect(page.getByText(/kayıtlı|bulunamadı|mevcut değil/i)).toHaveCount(0);
});



test("Admin reset page accepts Firebase oobCode and rejects unrelated modes", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/admin/reset-password?mode=resetPassword&oobCode=test-reset-code`);
  await expect(page.getByRole("heading", { name: "Yeni şifre belirle" })).toBeVisible();
  await page.getByLabel("Yeni şifre", { exact: true }).fill("NewAdminPass123!");
  await page.getByLabel("Yeni şifre tekrar").fill("NewAdminPass123!");

  let resetPayload = null;
  await page.route("**/api/admin/auth/password/reset", async (route) => {
    resetPayload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { message: "Şifreniz güncellendi." } }),
    });
  });
  await page.getByRole("button", { name: "Şifreyi güncelle" }).click();
  expect(resetPayload).toEqual({ token: "test-reset-code", newPassword: "NewAdminPass123!" });

  await page.goto(`${WEB_BASE_URL}/admin/reset-password?mode=verifyEmail&oobCode=not-a-reset`);
  await page.getByLabel("Yeni şifre", { exact: true }).fill("NewAdminPass123!");
  await page.getByLabel("Yeni şifre tekrar").fill("NewAdminPass123!");
  await page.getByRole("button", { name: "Şifreyi güncelle" }).click();
  await expect(page.getByText("Sıfırlama bağlantısı geçersiz veya süresi dolmuş.")).toBeVisible();
});
