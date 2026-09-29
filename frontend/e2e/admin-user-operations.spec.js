const { test, expect } = require("@playwright/test");
const WEB = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const id = "00000000-0000-4000-8000-000000000001";
async function setup(page, permissions = ["users.manage", "users.sessions.revoke"], options = {}) {
  const mutations = [];
  const user = {
    id,
    email: "uzun.kullanici.eposta.adresi@example.com",
    fullName: "Kontrollü Kullanıcı",
    role: options.staff ? "ADMIN" : "USER",
    isActive: true,
    createdAt: "2026-09-01T12:00:00Z",
    lastLoginAt: null,
    subscriptionTier: "FREE",
    onboardingCompleted: true,
    emailVerifiedAt: null,
  };
  let sessions = [1, 2].map((i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    device: i === 1 ? "Android · Chrome" : "Windows · Firefox",
    createdAt: "2026-09-01T12:00:00Z",
    expiresAt: "2026-10-01T12:00:00Z",
  }));
  let release;
  const pending = options.hold
    ? new Promise((resolve) => {
        release = resolve;
      })
    : Promise.resolve();
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const ok = (data) => route.fulfill({ json: { success: true, data } });
    if (path.endsWith("/auth/refresh-token"))
      return ok({
        user: { id: "admin", email: "admin@example.com", role: "ADMIN", onboardingCompleted: true },
        tokens: { accessToken: "a2-test", expiresIn: 900 },
      });
    if (path.endsWith("/admin/session"))
      return ok({
        admin: { id: "admin", email: "admin@example.com", fullName: "Yönetici" },
        roles: ["SUPPORT"],
        permissions: ["admin.access", "users.read", ...permissions],
        environment: { environment: "staging", application: "diewish", commit: "test" },
      });
    if (path.includes("/admin/users/") && method !== "GET") {
      const body = route.request().postDataJSON();
      mutations.push({ method, path, body });
      await pending;
      if (options.error)
        return route.fulfill({
          status: options.error,
          json: { success: false, error: { message: "PRIVATE SECRET STACK" } },
        });
      if (path.endsWith("/status")) {
        user.isActive = body.isActive;
        return ok({ id, isActive: user.isActive });
      }
      if (path.endsWith("/sessions")) {
        const count = sessions.length;
        sessions = [];
        return ok({ revokedCount: count });
      }
      sessions = sessions.filter((s) => !path.endsWith(`/${s.id}`));
      return ok({ revoked: true });
    }
    if (path.endsWith("/sessions")) return ok({ sessions, total: sessions.length });
    if (path.endsWith(`/users/${id}`)) return ok({ user });
    return ok({});
  });
  await page.goto(`${WEB}/admin/users/${id}`);
  await expect(
    page.getByRole("heading", { name: "Kontrollü Kullanıcı", exact: true }),
  ).toBeVisible();
  return { mutations, release: () => release?.() };
}
async function confirm(page, reason = "A2 test işlemi gerekçesi") {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("İşlem gerekçesi").fill(reason);
  await dialog.getByRole("button", { name: "Onayla ve uygula" }).click();
}
for (const [width, height] of [
  [390, 844],
  [412, 915],
  [768, 1024],
  [1440, 900],
]) {
  test(`A2 confirmation, status, sessions and responsive ${width}x${height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    const state = await setup(page);
    await page.getByRole("button", { name: "Hesabı pasif yap", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("opacity", "1");
    await expect(dialog.getByRole("button", { name: "Onayla ve uygula" })).toBeDisabled();
    await dialog.getByLabel("İşlem gerekçesi").fill("   ");
    await expect(dialog.getByRole("button", { name: "Onayla ve uygula" })).toBeDisabled();
    expect(state.mutations).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    await page.screenshot({ animations: "disabled", path: info.outputPath("a2-confirmation.png") });
    await dialog.getByRole("button", { name: "Vazgeç" }).click();
    expect(state.mutations).toHaveLength(0);
    await page.getByRole("button", { name: "Hesabı pasif yap", exact: true }).click();
    await confirm(page);
    await expect(page.getByRole("button", { name: "Hesabı aktif yap", exact: true })).toBeVisible();
    expect(state.mutations[0].body).toEqual({
      isActive: false,
      reason: "A2 test işlemi gerekçesi",
      confirmed: true,
    });
    await page.getByRole("button", { name: "Hesabı aktif yap", exact: true }).click();
    await confirm(page);
    await expect(page.getByRole("button", { name: "Hesabı pasif yap", exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Android · Chrome oturumunu sonlandır", exact: true })
      .click();
    await expect(dialog.getByText(/süresi dolana kadar/)).toBeVisible();
    await confirm(page);
    await expect(page.getByText("1 aktif oturum", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Tüm oturumları sonlandır", exact: true }).click();
    await confirm(page);
    await expect(page.getByText("Aktif oturum bulunamadı.")).toBeVisible();
    expect(state.mutations).toHaveLength(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
for (const [name, permissions, staff] of [
  ["read only", [], false],
  ["manage only", ["users.manage"], false],
  ["revoke only", ["users.sessions.revoke"], false],
  ["staff protected", ["users.manage", "users.sessions.revoke"], true],
]) {
  test(`A2 independent permissions ${name}`, async ({ page }) => {
    await setup(page, permissions, { staff });
    await expect(page.getByRole("button", { name: "Hesabı pasif yap", exact: true })).toHaveCount(
      !staff && permissions.includes("users.manage") ? 1 : 0,
    );
    await expect(page.getByRole("heading", { name: "Aktif oturumlar", exact: true })).toHaveCount(
      !staff && permissions.includes("users.sessions.revoke") ? 1 : 0,
    );
  });
}
test("A2 prevents duplicate submission and holds confirmation during request", async ({ page }) => {
  const state = await setup(page, ["users.manage"], { hold: true });
  await page.getByRole("button", { name: "Hesabı pasif yap" }).click();
  await confirm(page);
  await expect(page.getByRole("button", { name: "İşleniyor…" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(state.mutations).toHaveLength(1);
  state.release();
  await expect(page.getByRole("button", { name: "Hesabı aktif yap" })).toBeVisible();
});
for (const error of [403, 409, 500])
  test(`A2 safe mutation error ${error}`, async ({ page }) => {
    await setup(page, ["users.manage"], { error });
    await page.getByRole("button", { name: "Hesabı pasif yap" }).click();
    await confirm(page);
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await expect(page.getByText("PRIVATE SECRET STACK")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Onayla ve uygula" })).toBeDisabled();
  });
