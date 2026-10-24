import { test, expect, type Page } from "@playwright/test";
const WEB = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3042";
const permissions = [
  "admin.access",
  "system.read",
  "operations.read",
  "audit.read",
  "users.read",
  "admin.staff.read",
  "admin.roles.read",
];
const health = {
  application: "diewish-backend",
  version: "test",
  environment: "staging",
  commit: "a".repeat(40),
  status: "attention",
  scope: "admin-runtime",
  timestamp: "2026-10-24T10:00:00.000Z",
  checks: {
    backend: { status: "healthy", detail: "Yönetim API isteği yanıtlandı." },
    database: { status: "healthy", detail: "Admin veritabanı bağlantısı doğrulandı." },
    authentication: { status: "healthy", detail: "Oturum doğrulandı." },
    frontend: { status: "unknown", detail: "Henüz bağımsız olarak izlenmiyor." },
    scheduler: { status: "attention", detail: "Test ortamı otomasyonu duraklatılmış." },
    criticalServices: { status: "unknown", detail: "Henüz izlenmiyor." },
  },
};
async function setup(
  page: Page,
  options: {
    permissions?: string[];
    error?: boolean;
    delay?: boolean;
    empty?: boolean;
    partial?: boolean;
  } = {},
) {
  const calls: string[] = [];
  let failing = Boolean(options.error);
  let release: () => void = () => {};
  const hold = options.delay
    ? new Promise<void>((resolve) => {
        release = resolve;
      })
    : Promise.resolve();
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path);
    const ok = (data: unknown) => route.fulfill({ json: { success: true, data } });
    if (path.endsWith("/auth/refresh-token"))
      return ok({
        user: {
          id: "owner",
          email: "owner@example.invalid",
          role: "ADMIN",
          onboardingCompleted: true,
        },
        tokens: { accessToken: "synthetic-owner-token", expiresIn: 900 },
      });
    if (path.endsWith("/admin/session"))
      return ok({
        admin: { id: "owner", email: "owner@example.invalid", fullName: "Test Yöneticisi" },
        roles: ["SUPER_ADMIN"],
        permissions: options.permissions ?? permissions,
        environment: {
          environment: "staging",
          application: "diewish-backend",
          version: "test",
          commit: "a".repeat(40),
        },
      });
    if (path.endsWith("/admin/system/health")) {
      await hold;
      if (failing)
        return route.fulfill({
          status: 503,
          json: { success: false, error: { message: "PRIVATE ERROR DO NOT SHOW" } },
        });
      return ok(
        options.partial
          ? {
              ...health,
              status: "problem",
              checks: {
                ...health.checks,
                database: { status: "problem", detail: "Veritabanı kontrolü tamamlanamadı." },
              },
            }
          : health,
      );
    }
    if (path.endsWith("/admin/operations/summary"))
      return ok({
        users: { total: 12, active: 10, inactive: 2 },
        accountPlans: { FREE: 8, PREMIUM: 3, PREMIUM_PLUS: 1 },
        effectiveSubscriptions: null,
        planBasis: "stored-account-tier",
        timestamp: health.timestamp,
        scope: "admin-database",
      });
    if (path.endsWith("/admin/audit"))
      return ok({
        events: options.empty
          ? []
          : [
              {
                id: "audit1",
                action: "admin.staff.update",
                module: "staff",
                riskLevel: "HIGH",
                createdAt: health.timestamp,
              },
            ],
      });
    return ok({});
  });
  return {
    calls,
    release: () => release(),
    recover: () => {
      failing = false;
    },
  };
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const viewport of [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  for (const theme of ["light", "dark"] as const) {
    test(`owner and system ${viewport.width} ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await setup(page);
      await page.goto(`${WEB}/admin`);
      await expect(
        page.getByRole("heading", { name: "Yönetim merkezi", exact: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await expect(page.getByText("admin.staff.update", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Kayıtlı hesap planları" })).toBeVisible();
      await expect(page.getByText("a".repeat(40), { exact: true })).toBeVisible();
      await noOverflow(page);
      await page.screenshot({ path: testInfo.outputPath("owner.png"), fullPage: true });
      await page.getByRole("link", { name: "Sistem durumunu aç", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Sistem Durumu", exact: true })).toBeVisible();
      await expect(
        page.getByText("Test ortamı otomasyonu duraklatılmış.", { exact: true }),
      ).toBeVisible();
      await noOverflow(page);
      const headerY = await page
        .locator("header")
        .evaluate((element) => element.getBoundingClientRect().y);
      await page.evaluate(() => scrollTo(0, 500));
      expect(
        await page.locator("header").evaluate((element) => element.getBoundingClientRect().y),
      ).toBe(headerY);
      await page.evaluate(() => scrollTo(0, 0));
      if (viewport.width < 1024) {
        const trigger = page.getByRole("button", { name: "Gezinme menüsünü aç" });
        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(
          page.getByRole("navigation").getByRole("link", { name: "Sistem Durumu", exact: true }),
        ).toHaveAttribute("aria-current", "page");
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
      }
      await page.screenshot({ path: testInfo.outputPath("system.png"), fullPage: true });
    });
  }
}
test("permission navigation and dashboard do not request unauthorized data", async ({ page }) => {
  const fixture = await setup(page, { permissions: ["admin.access", "users.read"] });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${WEB}/admin`);
  await expect(page.getByText("Sistem durumunu görüntüleme izniniz yok.")).toBeVisible();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Kullanıcılar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Sistem Durumu", exact: true }),
  ).toHaveCount(0);
  expect(
    fixture.calls.some((path) => /system\/health|operations\/summary|admin\/audit/.test(path)),
  ).toBe(false);
  await page.goto(`${WEB}/admin/system`);
  await expect(page.getByRole("heading", { name: "Erişim reddedildi" })).toBeVisible();
  expect(fixture.calls.some((path) => /system\/health/.test(path))).toBe(false);
});
test("loading, independent panel errors and retry", async ({ page }) => {
  const fixture = await setup(page, { error: true, delay: true });
  await page.goto(`${WEB}/admin`);
  await expect(page.getByText("Sistem sağlığı yükleniyor…")).toBeVisible();
  await expect(page.getByText("admin.staff.update", { exact: true })).toBeVisible();
  fixture.release();
  await expect(
    page.getByRole("region", { name: "Sistem sağlığı" }).getByRole("alert"),
  ).toContainText("Veri mevcut değil");
  await expect(page.getByText("PRIVATE ERROR DO NOT SHOW")).toHaveCount(0);
  fixture.recover();
  await page.getByRole("button", { name: "Tekrar dene", exact: true }).click();
  await expect(page.getByText("a".repeat(40), { exact: true })).toBeVisible();
});
test("partial health, empty audit and visible unknown states", async ({ page }) => {
  await setup(page, { partial: true, empty: true });
  await page.goto(`${WEB}/admin`);
  await expect(page.getByText("Henüz işlem kaydı yok.")).toBeVisible();
  await expect(page.getByText("Veritabanı kontrolü tamamlanamadı.")).toBeVisible();
  await expect(page.getByText("Bilinmiyor", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Sorun", { exact: true }).first()).toBeVisible();
});
test("system-only Admin never receives operations or audit data", async ({ page }) => {
  const fixture = await setup(page, { permissions: ["admin.access", "system.read"] });
  await page.goto(`${WEB}/admin`);
  await expect(page.getByText("a".repeat(40), { exact: true })).toBeVisible();
  expect(fixture.calls.some((path) => /operations\/summary|admin\/audit/.test(path))).toBe(false);
});
