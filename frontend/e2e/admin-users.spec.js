const { test, expect } = require("@playwright/test");
const WEB = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const users = Array.from({ length: 26 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  email: `${i === 0 ? "uzun.kullanici.eposta.adresi.ekran.disina.tasmamali" : `user${i}`}@example.com`,
  fullName: i === 0 ? "Uzun Kullanıcı Adı Soyadı" : `Kullanıcı ${i}`,
  role: "USER",
  isActive: i % 2 === 0,
  createdAt: "2026-09-01T12:00:00.000Z",
  lastLoginAt: null,
  emailVerifiedAt: null,
  onboardingCompleted: true,
  subscriptionTier: i === 0 ? null : "FREE",
}));

async function setup(page, options = {}) {
  const calls = [];
  let failing = Boolean(options.error);
  let release;
  const hold = options.loading
    ? new Promise((resolve) => {
        release = resolve;
      })
    : Promise.resolve();
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const ok = (data) => route.fulfill({ json: { success: true, data } });
    if (path.endsWith("/auth/refresh-token"))
      return ok({
        user: { id: "admin", email: "admin@example.com", role: "ADMIN", onboardingCompleted: true },
        tokens: { accessToken: "a1-fixture", expiresIn: 900 },
      });
    if (path.endsWith("/admin/session"))
      return ok({
        admin: { id: "admin", email: "admin@example.com", fullName: "Yönetici" },
        roles: ["SUPPORT"],
        permissions: options.denied ? ["admin.access"] : ["admin.access", "users.read"],
        environment: {
          environment: "staging",
          application: "diewish",
          version: "test",
          commit: "test",
        },
      });
    if (path.includes("/admin/users")) {
      calls.push(url);
      await hold;
      if (failing)
        return route.fulfill({
          status: 500,
          json: { success: false, error: { message: "PRIVATE INTERNAL STACK" } },
        });
      if (options.revoked)
        return route.fulfill({
          status: 403,
          json: { success: false, error: { message: "Forbidden" } },
        });
      if (path.endsWith("/admin/users")) {
        const search = (url.searchParams.get("search") || "").toLowerCase();
        const status = url.searchParams.get("status");
        const pageNumber = Number(url.searchParams.get("page") || 1);
        const filtered = users.filter(
          (user) =>
            (user.email.toLowerCase().includes(search) || user.id === search) &&
            (status === "all" || user.isActive === (status === "active")),
        );
        return ok({
          users: filtered.slice((pageNumber - 1) * 25, pageNumber * 25),
          pagination: {
            page: pageNumber,
            pageSize: 25,
            total: filtered.length,
            totalPages: Math.ceil(filtered.length / 25),
          },
        });
      }
      const user = users.find((user) => path.endsWith(`/${user.id}`));
      if (!user)
        return route.fulfill({
          status: 404,
          json: { success: false, error: { message: "Missing" } },
        });
      return ok({ user });
    }
    return ok({});
  });
  return {
    calls,
    release: () => release?.(),
    recover: () => {
      failing = false;
    },
  };
}
async function overflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const [width, height] of [
  [390, 844],
  [412, 915],
  [768, 1024],
  [1440, 900],
]) {
  test(`A1 list, drawer, detail and responsive ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    await page.goto(`${WEB}/admin/users`);
    await expect(page.getByText("26 kullanıcı", { exact: false })).toBeVisible();
    await overflow(page);
    await page.screenshot({ path: testInfo.outputPath("users-list.png") });
    if (width < 1024) await page.getByRole("button", { name: "Gezinme menüsünü aç" }).click();
    const navigation = page.getByRole("navigation", { name: "Yönetim merkezi", exact: true });
    await expect(
      navigation.getByRole("link", { name: "Kullanıcılar", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    if (width < 1024) await page.keyboard.press("Escape");
    await page
      .getByRole("link", { name: `${users[0].email} kullanıcı detayı`, exact: true })
      .filter({ visible: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Kullanıcı detayı", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(users[0].id, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Abonelik", exact: true })).toBeVisible();
    await expect(page.getByText("Bilgi yok", { exact: true })).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: /Premium ver|Pasif yap|Sil|Oturum iptal/i }),
    ).toHaveCount(0);
    await overflow(page);
    await page.screenshot({ path: testInfo.outputPath("user-detail.png") });
    await page.getByRole("button", { name: "Yönetici profili: Yönetici", exact: true }).click();
    await expect(page.getByRole("button", { name: "Çıkış Yap", exact: true })).toBeVisible();
  });
}
test("A1 email and ID search, status filter, pagination and empty results", async ({ page }) => {
  await setup(page);
  await page.goto(`${WEB}/admin/users`);
  await expect(page.getByText("26 kullanıcı", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect(page.getByText("Sayfa 2 / 2", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sonraki", exact: true })).toBeDisabled();
  await page.getByLabel("Kullanıcı ara", { exact: true }).fill(users[0].email.toUpperCase());
  await page.getByRole("button", { name: "Ara", exact: true }).click();
  await expect(page.getByText("1 kullanıcı · Sayfa 1 / 1", { exact: true })).toBeVisible();
  await page.getByLabel("Kullanıcı ara", { exact: true }).fill(users[1].id);
  await page.getByRole("button", { name: "Ara", exact: true }).click();
  await expect(
    page.getByText(users[1].email, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByLabel("Kullanıcı ara", { exact: true }).fill("");
  await page.getByLabel("Hesap durumu", { exact: true }).selectOption("inactive");
  await page.getByRole("button", { name: "Ara", exact: true }).click();
  await expect(page.getByText("13 kullanıcı", { exact: false })).toBeVisible();
  await page.getByLabel("Kullanıcı ara", { exact: true }).fill("not-found");
  await page.getByRole("button", { name: "Ara", exact: true }).click();
  await expect(page.getByText("Bu kriterlere uyan kullanıcı bulunamadı.")).toBeVisible();
});
test("A1 missing permission hides navigation and blocks list/detail before API", async ({
  page,
}) => {
  const fixture = await setup(page, { denied: true });
  await page.goto(`${WEB}/admin`);
  await expect(page.getByRole("heading", { name: "Yönetim merkezi", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kullanıcılar", exact: true })).toHaveCount(0);
  for (const path of ["/admin/users", `/admin/users/${users[0].id}`]) {
    await page.goto(WEB + path);
    await expect(page.getByRole("heading", { name: "Erişim reddedildi" })).toBeVisible();
  }
  expect(fixture.calls).toHaveLength(0);
});
test("A1 loading, sanitized error and retry", async ({ page }) => {
  const fixture = await setup(page, { loading: true, error: true });
  await page.goto(`${WEB}/admin/users`);
  await expect(page.getByText("Kullanıcı bilgileri yükleniyor")).toBeAttached();
  fixture.release();
  await expect(page.locator("#admin-main").getByRole("alert")).toContainText(
    "Kullanıcı bilgileri yüklenemedi",
  );
  await expect(page.getByText("PRIVATE INTERNAL STACK")).toHaveCount(0);
  fixture.recover();
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await expect(page.getByText("26 kullanıcı", { exact: false })).toBeVisible();
});
test("A1 API permission revocation and missing detail show safe errors", async ({ page }) => {
  await setup(page, { revoked: true });
  await page.goto(`${WEB}/admin/users`);
  await expect(page.locator("#admin-main").getByRole("alert")).toContainText("yetkiniz yok");
  await page.unrouteAll();
  await setup(page);
  await page.goto(`${WEB}/admin/users/00000000-0000-4000-8000-999999999999`);
  await expect(page.locator("#admin-main").getByRole("alert")).toContainText(
    "Kullanıcı bulunamadı",
  );
});
