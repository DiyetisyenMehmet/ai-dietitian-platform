import { test, expect } from "@playwright/test";

test("fragment link is scrubbed; reset sends actual server contract and prevents duplicate submits", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3000",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (new URL(request.url()).pathname.endsWith("/auth/reset-password")) {
      calls++;
      expect(request.postDataJSON()).toEqual({
        token: "synthetic-browser-token",
        newPassword: "BrowserRecovery123!",
      });
      await new Promise((r) => setTimeout(r, 250));
      return route.fulfill({ headers, json: { success: true, data: { message: "Completed" } } });
    }
    return route.fulfill({
      status: 401,
      headers,
      json: { success: false, error: { code: "UNAUTHORIZED", message: "Synthetic session" } },
    });
  });
  await page.goto("/reset-password#token=synthetic-browser-token");
  await expect(page.getByRole("heading", { name: "Yeni şifre belirleyin" })).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("Yeni Şifre", { exact: true }).fill("BrowserRecovery123!");
  await page.getByLabel("Yeni Şifre (Tekrar)").fill("BrowserRecovery123!");
  await page.getByRole("button", { name: "Şifreyi Güncelle", exact: true }).click();
  await expect(page.getByRole("button", { name: "Güncelleniyor..." })).toBeDisabled();
  await expect(page).toHaveURL(/\/login$/);
  expect(calls).toBe(1);
});

test("invalid link response keeps user on reset screen and displays a safe recovery error", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3000",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    return route.fulfill({
      status: 400,
      headers,
      json: {
        success: false,
        error: {
          code: "TOKEN_INVALID",
          message: "Bu bağlantı geçersiz veya süresi dolmuş. Lütfen yeni bağlantı isteyin.",
        },
      },
    });
  });
  await page.goto("/reset-password#token=synthetic-expired-token");
  await page.getByLabel("Yeni Şifre", { exact: true }).fill("BrowserRecovery123!");
  await page.getByLabel("Yeni Şifre (Tekrar)").fill("BrowserRecovery123!");
  await page.getByRole("button", { name: "Şifreyi Güncelle", exact: true }).click();
  await expect(
    page.getByText("Bu bağlantı geçersiz veya süresi dolmuş. Lütfen yeni bağlantı isteyin."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
});

test("forgot screen acknowledges request without falsely claiming delivery", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3000",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (new URL(route.request().url()).pathname.endsWith("/auth/forgot-password"))
      return route.fulfill({
        headers,
        json: { success: true, data: { message: "İsteğiniz alındı." } },
      });
    return route.fulfill({
      status: 401,
      headers,
      json: { success: false, error: { code: "UNAUTHORIZED", message: "Synthetic session" } },
    });
  });
  await page.goto("/forgot-password");
  await page.getByLabel("E-posta", { exact: true }).fill("synthetic@example.com");
  await page.getByRole("button", { name: "Sıfırlama Bağlantısı Gönder" }).click();
  await expect(page.getByText(/kayıtlı uygun bir hesabınız varsa/)).toBeVisible();
  await expect(page.getByText(/bağlantısı gönderdik/)).toHaveCount(0);
});

test("legacy query links survive URL scrubbing without losing the captured token", async ({
  page,
}) => {
  await page.goto("/reset-password?token=synthetic-legacy-token");
  await expect(page.getByRole("heading", { name: "Yeni şifre belirleyin" })).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByLabel("Yeni Şifre", { exact: true })).toBeVisible();
});
