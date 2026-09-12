const { test, expect } = require("@playwright/test");

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";

test("login identity entry points are branded and phone navigation is actionable", async ({ page }) => {
  await page.goto(`${WEB_BASE_URL}/login`);

  const google = page.getByRole("button", { name: "Google ile devam et" });
  await expect(google).toBeVisible();
  await expect(google.locator('[data-testid="google-brand-icon"]')).toBeVisible();

  const phone = page.getByRole("button", { name: "Telefon numarası ile devam et" });
  await expect(phone).toBeVisible();
  await phone.click();

  await expect(page).toHaveURL(/\/phone-auth$/);
  await expect(page.getByRole("heading", { name: "Telefon ile devam et" })).toBeVisible();
  await expect(page.getByLabel("Telefon numarası")).toHaveValue("+90");
  await expect(page.getByRole("button", { name: "SMS kodu gönder" })).toBeVisible();
});
