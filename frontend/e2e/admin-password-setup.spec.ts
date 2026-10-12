import { test, expect, type Page } from "@playwright/test";

async function mockApi(page: Page, context: "invitation" | "reset", invalid = false) {
  const counts = { verify: 0, reset: 0 };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3000",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path.endsWith("/password/verify")) {
      counts.verify++;
      return route.fulfill({
        status: invalid ? 400 : 200,
        headers,
        json: invalid
          ? {
              success: false,
              error: { code: "ADMIN_RESET_LINK_INVALID", message: "Internal provider error" },
            }
          : { success: true, data: { context } },
      });
    }
    if (path.endsWith("/password/reset")) {
      counts.reset++;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return route.fulfill({
        status: 200,
        headers,
        json: { success: true, data: { context, message: "Completed" } },
      });
    }
    return route.fulfill({
      status: 401,
      headers,
      json: { success: false, error: { code: "UNAUTHORIZED", message: "Unauthenticated fixture" } },
    });
  });
  return counts;
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`invitation setup at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const counts = await mockApi(page, "invitation");
    await page.goto("/admin/reset-password?mode=resetPassword&oobCode=synthetic-browser-code");
    await expect(
      page.getByRole("heading", { name: "Yönetim Merkezi hesabınızı etkinleştirin" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/reset-password$/);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByLabel("Yeni şifre", { exact: true }).fill("BrowserSetupPass123!");
    await page.getByRole("button", { name: "Şifreyi göster", exact: true }).first().click();
    await expect(page.getByLabel("Yeni şifre", { exact: true })).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Şifreyi gizle", exact: true }).click();
    await expect(page.getByLabel("Yeni şifre", { exact: true })).toHaveAttribute(
      "type",
      "password",
    );
    await page.getByLabel("Yeni şifre tekrar").fill("BrowserSetupPass123!");
    const submit = page.getByRole("button", { name: "Şifremi belirle", exact: true });
    await submit.click();
    await expect(
      page.getByRole("heading", { name: "Yönetim Merkezi hesabınız etkinleştirildi." }),
    ).toBeVisible();
    expect(counts.reset).toBe(1);
    await expect(page.getByRole("link", { name: "Yönetim Merkezi'ne giriş yap" })).toHaveAttribute(
      "href",
      "/admin/login",
    );
    expect(
      await page.evaluate(
        () =>
          ![...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) =>
            String(value).includes("synthetic-browser-code"),
          ),
      ),
    ).toBe(true);
  });
}

test("expired / reused / missing action link stays branded and cannot submit", async ({ page }) => {
  await mockApi(page, "invitation", true);
  await page.goto("/admin/reset-password#mode=resetPassword&oobCode=synthetic-invalid-code");
  await expect(
    page.getByRole("heading", { name: "Bu bağlantının süresi dolmuş veya daha önce kullanılmış." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Yeni şifre bağlantısı iste" })).toHaveAttribute(
    "href",
    "/admin/forgot-password",
  );
  await expect(page.getByText("Internal provider error")).toHaveCount(0);
  await expect(page.getByLabel("Yeni şifre", { exact: true })).toHaveCount(0);
  await page.goto("/admin/reset-password");
  await expect(
    page.getByRole("heading", { name: "Bu bağlantının süresi dolmuş veya daha önce kullanılmış." }),
  ).toBeVisible();
});

test("normal Admin reset, mismatched passwords and keyboard focus", async ({ page }) => {
  const counts = await mockApi(page, "reset");
  await page.goto("/admin/reset-password#mode=resetPassword&oobCode=synthetic-reset-code");
  await expect(page.getByRole("heading", { name: "Yeni şifre belirle" })).toBeVisible();
  const password = page.getByLabel("Yeni şifre", { exact: true });
  await password.fill("BrowserResetPass123!");
  await password.press("Tab");
  await expect(
    page.getByRole("button", { name: "Şifreyi göster", exact: true }).first(),
  ).toBeFocused();
  await page.getByLabel("Yeni şifre tekrar").fill("OtherPassword456!");
  await page.getByRole("button", { name: "Şifremi güncelle" }).click();
  await expect(page.locator("#admin-password-feedback")).toHaveText("Şifreler eşleşmiyor.");
  expect(counts.reset).toBe(0);
  await page.getByLabel("Yeni şifre tekrar").fill("BrowserResetPass123!");
  await page.getByRole("button", { name: "Şifremi güncelle" }).click();
  await expect(
    page.getByRole("heading", { name: "Şifreniz başarıyla güncellendi." }),
  ).toBeVisible();
  expect(counts.reset).toBe(1);
});

test("only explicit trusted Admin continuation reaches the Admin reset form", async ({ page }) => {
  await mockApi(page, "invitation");
  const continuation = encodeURIComponent(
    "http://127.0.0.1:3000/admin/reset-password?context=invitation",
  );
  await page.goto(
    `/auth/action?mode=resetPassword&oobCode=synthetic-router-code&continueUrl=${continuation}`,
  );
  await expect(
    page.getByRole("heading", { name: "Yönetim Merkezi hesabınızı etkinleştirin" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/reset-password$/);
  await page.goto(
    "/auth/action?mode=verifyEmail&oobCode=synthetic-user-code&continueUrl=https%3A%2F%2Fevil.example%2Fadmin%2Freset-password%3Fcontext%3Dinvitation",
  );
  await expect(page.getByRole("heading", { name: "Bu bağlantı doğrulanamadı." })).toBeVisible();
  await expect(page.getByLabel("Yeni şifre", { exact: true })).toHaveCount(0);
});
