const { test, expect } = require("@playwright/test");

const WEB = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const permissions = [
  "admin.access",
  "admin.staff.read",
  "admin.roles.read",
  "admin.staff.manage",
  "admin.roles.manage",
  "audit.read",
];
const email = "mehmet.uzun.yonetici.hesabi@example.com";

// API fixtures isolate presentation from real staff data. The existing
// admin-foundation suite continues to exercise the real backend and DB.
async function setup(page, options = {}) {
  let signedIn = true;
  let logoutCount = 0;
  const auth = {
    user: {
      id: "shell-admin",
      email,
      fullName: "Mehmet Uzun Yönetici Adı",
      role: "ADMIN",
      onboardingCompleted: true,
    },
    tokens: { accessToken: "shell-test-token", expiresIn: 900 },
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data) => route.fulfill({ status: 200, json: { success: true, data } });
    const denied = () =>
      route.fulfill({
        status: 401,
        json: {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
      });
    if (path.endsWith("/auth/logout")) {
      logoutCount += 1;
      if (options.logoutFailure) return route.fulfill({ status: 503, json: { success: false } });
      signedIn = false;
      return ok({ message: "Logged out successfully." });
    }
    if (path.endsWith("/auth/refresh-token")) return signedIn ? ok(auth) : denied();
    if (!signedIn) return denied();
    if (path.endsWith("/admin/session"))
      return ok({
        admin: { id: auth.user.id, email, fullName: auth.user.fullName },
        roles: options.roles || ["SUPER_ADMIN"],
        permissions: options.permissions || permissions,
        environment: {
          environment: options.environment || "staging",
          application: "diewish",
          version: "test",
          commit: "test-sha",
        },
      });
    if (path.endsWith("/admin/access/staff")) return ok({ users: [] });
    if (path.endsWith("/admin/access/roles")) return ok({ roles: [] });
    if (path.endsWith("/admin/access/permissions")) return ok({ permissions: [] });
    if (path.endsWith("/admin/access/invitations")) return ok({ invitations: [] });
    if (path.endsWith("/admin/audit")) return ok({ events: [] });
    return ok({});
  });
  return { logoutCount: () => logoutCount };
}

async function openNav(page, width) {
  if (width < 1024) await page.getByRole("button", { name: "Gezinme menüsünü aç" }).click();
  return page.getByRole("navigation", { name: "Yönetim merkezi" });
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`shell navigation, profile and geometry ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await setup(page);
    await page.goto(`${WEB}/admin`);
    await expect(page.getByRole("heading", { name: "Yönetim merkezi", exact: true })).toBeVisible();
    await expect(page.getByTestId("admin-environment-banner")).toHaveText("STAGING");
    await noOverflow(page);
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath("overview.png") });
    const header = await page.locator("header").boundingBox();
    const main = await page.locator("#admin-main").boundingBox();
    expect(main.y).toBeGreaterThanOrEqual(header.y + header.height);
    if (viewport.width < 1024) {
      await expect(page.getByRole("navigation")).toHaveCount(0);
      expect(main.y).toBeLessThan(100);
    } else {
      expect(main.x).toBeGreaterThanOrEqual(224);
    }

    for (const [label, path, heading] of [
      ["Yetkililer & Roller", "/admin/access", "Yetkili çalışanlar"],
      ["İşlem Geçmişi", "/admin/audit", "İşlem geçmişi"],
      ["Genel Bakış", "/admin", "Yönetim merkezi"],
    ]) {
      const nav = await openNav(page, viewport.width);
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(`${WEB}${path}`);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      const activeNav = await openNav(page, viewport.width);
      await expect(activeNav.getByRole("link", { name: label, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(activeNav.locator('[aria-current="page"]')).toHaveCount(1);
      await noOverflow(page);
      if (viewport.width < 1024) {
        await page.screenshot({
          animations: "disabled",
          path: testInfo.outputPath(`navigation-${path.split("/").pop()}.png`),
        });
        const box = await page.getByRole("dialog").boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.width).toBeLessThan(viewport.width);
        expect(box.height).toBeLessThanOrEqual(viewport.height);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "Gezinme menüsünü aç" })).toBeFocused();
      }
    }

    const profile = page.getByRole("button", { name: /^Yönetici profili:/ });
    await profile.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Yönetici profili" });
    await expect(dialog.getByText(email, { exact: true })).toBeVisible();
    await expect(dialog.getByText("Süper Yönetici", { exact: true })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath("profile.png") });
    await dialog.getByRole("button", { name: "Hesap ve Güvenlik" }).click();
    await expect(page.locator("#admin-account-security")).toBeFocused();
    const account = await page.locator("#admin-account-security").boundingBox();
    expect(account.y).toBeGreaterThanOrEqual(header.height);
    await expect(page.getByLabel("Yeni e-posta")).toBeVisible();
  });
}

test("mobile drawer traps focus, closes on Escape, outside interaction and desktop resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto(`${WEB}/admin`);
  const trigger = page.getByRole("button", { name: "Gezinme menüsünü aç" });
  await trigger.click();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.getByRole("dialog").evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  await expect(page.locator("body")).toHaveCSS("pointer-events", "none");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(385, 500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await trigger.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation")).toBeVisible();
});

test("restricted admin sees only permitted links and direct routes remain denied", async ({
  page,
}) => {
  await setup(page, { permissions: ["admin.access", "admin.staff.read"], roles: ["ADMIN_STAFF"] });
  await page.goto(`${WEB}/admin`);
  await expect(page.getByRole("link", { name: "Genel Bakış", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Yetkililer & Roller" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "İşlem Geçmişi" })).toHaveCount(0);
  await expect(page.getByLabel("Yeni e-posta")).toHaveCount(0);
  await expect(page.getByLabel("Yeni şifre", { exact: true })).toBeVisible();
  for (const path of ["access", "audit"]) {
    await page.goto(`${WEB}/admin/${path}`);
    await expect(page.getByRole("heading", { name: "Erişim reddedildi" })).toBeVisible();
  }
});

test("profile account action navigates from another admin route to existing security section", async ({
  page,
}) => {
  await setup(page);
  await page.goto(`${WEB}/admin/audit`);
  await page.getByRole("button", { name: /^Yönetici profili:/ }).click();
  await page.getByRole("button", { name: "Hesap ve Güvenlik" }).click();
  await expect(page).toHaveURL(`${WEB}/admin#admin-account-security`);
  await expect(page.locator("#admin-account-security")).toBeFocused();
});

test("logout revokes session, clears legacy storage, and back/direct navigation cannot reopen admin", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto(`${WEB}/admin`);
  await page.getByRole("link", { name: "İşlem Geçmişi" }).click();
  await page.evaluate(() => localStorage.setItem("diewish.auth.session", "legacy"));
  await page.getByRole("button", { name: /^Yönetici profili:/ }).click();
  await page.getByRole("button", { name: "Çıkış Yap", exact: true }).click();
  await expect(page).toHaveURL(`${WEB}/admin/login`);
  expect(state.logoutCount()).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("diewish.auth.session"))).toBeNull();
  await page.goBack();
  await expect(page).toHaveURL(`${WEB}/admin/login`);
  for (const path of ["/admin", "/admin/access", "/admin/audit"]) {
    await page.goto(`${WEB}${path}`);
    await expect(page).toHaveURL(`${WEB}/admin/login`);
    await expect(page.getByRole("navigation", { name: "Yönetim merkezi" })).toHaveCount(0);
  }
});

test("failed server logout is reported and can be retried without claiming success", async ({
  page,
}) => {
  const state = await setup(page, { logoutFailure: true });
  await page.goto(`${WEB}/admin`);
  await page.getByRole("button", { name: /^Yönetici profili:/ }).click();
  await page.getByRole("button", { name: "Çıkış Yap", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Çıkış tamamlanamadı");
  await expect(page.getByRole("button", { name: "Çıkış Yap", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Çıkış Yap", exact: true }).click();
  await expect.poll(() => state.logoutCount()).toBe(2);
  await expect(page).toHaveURL(`${WEB}/admin`);
});

test("production environment never renders the shell", async ({ page }) => {
  await setup(page, { environment: "production" });
  await page.goto(`${WEB}/admin`);
  await expect(page.getByRole("heading", { name: "Erişim reddedildi" })).toBeVisible();
  await expect(page.getByTestId("admin-environment-banner")).toHaveCount(0);
});
