import { test, expect, type Page } from "@playwright/test";
const WEB = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3042";
const id = "00000000-0000-4000-8000-000000000201";
const otherId = "00000000-0000-4000-8000-000000000202";
const email = "a2.cok.uzun.kullanici.eposta.adresi.tasma.olmamalidir@example.invalid";
const all = [
  "admin.access",
  "users.read",
  "entitlements.read",
  "users.sessions.revoke",
  "audit.read",
];
const user = {
  id,
  email,
  fullName: "Ayşe Uzun Soyadı",
  role: "USER",
  isActive: true,
  emailVerifiedAt: null,
  onboardingCompleted: false,
  lastLoginAt: null,
  createdAt: "2026-10-01T12:00:00Z",
  subscriptionTier: "FREE",
};
const plan = {
  currentPlan: "PREMIUM_PLUS",
  providerPlan: "FREE",
  currentPlanSource: "ADMIN_SUPPORT",
  entitlementStatus: "ACTIVE",
  entitlements: ["PRIORITY_SUPPORT"],
  record: null,
  supportEntitlement: {
    id: "support",
    tier: "PREMIUM_PLUS",
    status: "ACTIVE",
    grantedAt: "2026-10-01T12:00:00Z",
    expiresAt: "2030-01-01T12:00:00Z",
    updatedAt: "2026-10-01T12:00:00Z",
  },
};
async function fixture(
  page: Page,
  options: {
    permissions?: string[];
    failures?: string[];
    hold?: boolean;
    inactive?: boolean;
    mismatch?: boolean;
    emptyAudit?: boolean;
  } = {},
) {
  const calls: Array<{ path: string; query: string }> = [];
  const failures = new Set(options.failures ?? []);
  let release: () => void = () => {};
  const hold = options.hold
    ? new Promise<void>((resolve) => {
        release = resolve;
      })
    : Promise.resolve();
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    calls.push({ path, query: url.search });
    const ok = (data: unknown) => route.fulfill({ json: { success: true, data } });
    const fail = () =>
      route.fulfill({
        status: 503,
        json: { success: false, error: { message: "PRIVATE_INTERNAL_HEALTH_TOKEN" } },
      });
    if (path.endsWith("/auth/refresh-token"))
      return ok({
        user: {
          id: "admin",
          email: "admin@example.invalid",
          role: "ADMIN",
          onboardingCompleted: true,
        },
        tokens: { accessToken: "synthetic-admin", expiresIn: 900 },
      });
    if (path.endsWith("/admin/session"))
      return ok({
        admin: { id: "admin", email: "admin@example.invalid", fullName: "A2 Yönetici" },
        roles: ["SUPER_ADMIN"],
        permissions: options.permissions ?? all,
        environment: {
          environment: "staging",
          application: "diewish",
          version: "test",
          commit: "a2-fixture",
        },
      });
    if (path.endsWith("/admin/users")) {
      await hold;
      if (failures.has("search")) return fail();
      const search = url.searchParams.get("search") || "";
      const users =
        search === "none@example.invalid"
          ? []
          : search.toLowerCase() === id
            ? [user]
            : search === "other@example.invalid"
              ? [
                  {
                    ...user,
                    id: otherId,
                    email: "other@example.invalid",
                    fullName: "Diğer Kullanıcı",
                  },
                ]
              : [
                  user,
                  {
                    ...user,
                    id: otherId,
                    email: "second@example.invalid",
                    fullName: "İkinci Kullanıcı",
                  },
                ];
      return ok({
        users,
        pagination: {
          page: 1,
          pageSize: 10,
          total: users.length,
          totalPages: users.length ? 1 : 0,
        },
      });
    }
    if (path.endsWith("/subscription")) {
      if (failures.has("subscription")) {
        await hold;
        return fail();
      }
      await hold;
      return ok({
        subscription: options.mismatch
          ? { ...plan, currentPlanSource: "ACCOUNT_DEFAULT", supportEntitlement: null }
          : plan,
      });
    }
    if (path.endsWith("/sessions")) {
      await hold;
      if (failures.has("sessions")) return fail();
      return ok({
        total: 1,
        sessions: [
          {
            id: "session",
            device: "Android · Chrome",
            createdAt: "2026-10-01T12:00:00Z",
            expiresAt: "2030-01-01T12:00:00Z",
          },
        ],
      });
    }
    if (path.endsWith("/admin/audit")) {
      await hold;
      if (failures.has("audit")) return fail();
      const selected = url.searchParams.get("user");
      return ok({
        events: options.emptyAudit
          ? []
          : [
              {
                id: "event",
                action: "admin.users.deactivate",
                module: "users",
                riskLevel: "HIGH",
                createdAt: "2026-10-01T12:00:00Z",
                targetType: "user",
                targetId: selected,
                beforeState: { private: "PRIVATE_INTERNAL_HEALTH_TOKEN" },
              },
              {
                id: "foreign",
                action: "FOREIGN_USER_EVENT",
                module: "users",
                riskLevel: "LOW",
                createdAt: "2026-10-01T12:00:00Z",
                targetType: "user",
                targetId: selected === id ? otherId : id,
              },
            ],
      });
    }
    if (path.endsWith(`/users/${id}`) || path.endsWith(`/users/${otherId}`)) {
      const second = path.endsWith(otherId);
      return ok({
        user: {
          ...user,
          id: second ? otherId : id,
          fullName: second ? "Diğer Kullanıcı" : user.fullName,
          email: second ? "other@example.invalid" : email,
          isActive: !options.inactive,
        },
      });
    }
    return ok({});
  });
  return { calls, release: () => release(), recover: (name: string) => failures.delete(name) };
}
async function openSearch(page: Page) {
  await page.getByRole("button", { name: "Global kullanıcı araması" }).click();
  return page.getByRole("dialog", { name: "Kullanıcı bul", exact: true });
}
async function search(page: Page, query: string) {
  const modal = await openSearch(page);
  await modal.getByLabel("E-posta veya tam UUID").fill(query);
  await modal.getByRole("button", { name: "Ara", exact: true }).click();
  return modal;
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
  for (const theme of ["light", "dark"]) {
    test(`A2 search and User360 ${viewport.width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      const data = await fixture(page);
      await page.goto(`${WEB}/admin/users`);
      const modal = await search(page, "a2@example.invalid");
      await expect(modal.getByRole("link")).toHaveCount(2);
      await noOverflow(page);
      await modal.getByRole("link").first().focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(`${WEB}/admin/users/${id}`);
      await expect(page.getByRole("heading", { name: user.fullName, exact: true })).toBeVisible();
      await expect(page.getByTestId("admin-user-subscription")).toContainText("Premium Plus");
      await expect(page.getByTestId("diagnosis-email")).toContainText("OLASI NEDEN");
      await expect(page.getByTestId("diagnosis-login")).toContainText("DOĞRULANAMADI");
      await expect(page.getByTestId("diagnosis-subscription")).toContainText(
        "SORUN TESPİT EDİLEMEDİ",
      );
      await expect(
        page.getByRole("heading", { name: "Aktif oturumlar", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Kullanıcıya ait yönetici geçmişi" }),
      ).toContainText("admin.users.deactivate");
      await expect(page.getByText("FOREIGN_USER_EVENT")).toHaveCount(0);
      await expect(page.getByText("PRIVATE_INTERNAL_HEALTH_TOKEN")).toHaveCount(0);
      expect(
        data.calls.some(
          (call) => call.path.endsWith("/audit") && call.query.includes(`user=${id}`),
        ),
      ).toBe(true);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath("user360.png"), fullPage: true });
    });
  }
}
test("A2 exact UUID, empty result, keyboard focus and Escape", async ({ page }) => {
  const data = await fixture(page);
  await page.goto(`${WEB}/admin/users`);
  const trigger = page.getByRole("button", { name: "Global kullanıcı araması" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  let modal = page.getByRole("dialog", { name: "Kullanıcı bul", exact: true });
  await expect(modal.getByLabel("E-posta veya tam UUID")).toBeFocused();
  await modal.getByLabel("E-posta veya tam UUID").fill(id.toUpperCase());
  await page.keyboard.press("Enter");
  await expect(modal.getByRole("link")).toHaveCount(1);
  expect(data.calls.some((call) => call.query.includes(id.toUpperCase()))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  modal = await search(page, "none@example.invalid");
  await expect(modal.getByRole("status")).toContainText("Eşleşen kullanıcı bulunamadı");
});
test("A2 search loading, sanitized error and retry", async ({ page }) => {
  const data = await fixture(page, { failures: ["search"], hold: true });
  await page.goto(`${WEB}/admin/users/${id}`);
  const modal = await search(page, "a2@example.invalid");
  await expect(modal.getByRole("status")).toContainText("Kullanıcılar aranıyor");
  data.release();
  await expect(modal.getByRole("alert")).toContainText("Arama tamamlanamadı");
  await expect(modal.getByText("PRIVATE_INTERNAL_HEALTH_TOKEN")).toHaveCount(0);
  data.recover("search");
  await modal.getByRole("button", { name: "Tekrar dene" }).click();
  await modal.getByRole("button", { name: "Ara", exact: true }).click();
  await expect(modal.getByRole("link")).toHaveCount(2);
});
test("A2 no users.read means no global search or unauthorized data requests", async ({ page }) => {
  const data = await fixture(page, { permissions: ["admin.access"] });
  await page.goto(`${WEB}/admin`);
  await expect(page.getByRole("heading", { name: "Yönetim merkezi", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Global kullanıcı araması" })).toHaveCount(0);
  expect(data.calls.some((call) => /admin\/(users|audit)/.test(call.path))).toBe(false);
  await page.goto(`${WEB}/admin/users/${id}`);
  await expect(page.getByRole("heading", { name: "Erişim reddedildi" })).toBeVisible();
  expect(data.calls.some((call) => /admin\/(users|audit)/.test(call.path))).toBe(false);
});
for (const permission of ["entitlements.read", "users.sessions.revoke", "audit.read"]) {
  test(`A2 partial permission ${permission}`, async ({ page }) => {
    const data = await fixture(page, { permissions: ["admin.access", "users.read", permission] });
    await page.goto(`${WEB}/admin/users/${id}`);
    await expect(page.getByRole("heading", { name: user.fullName, exact: true })).toBeVisible();
    if (permission !== "entitlements.read") {
      await expect(page.getByTestId("admin-user-subscription")).toHaveCount(0);
      await expect(page.getByTestId("diagnosis-subscription")).toContainText("DOĞRULANAMADI");
    }
    if (permission !== "users.sessions.revoke")
      await expect(page.getByTestId("diagnosis-sessions")).toContainText("DOĞRULANAMADI");
    if (permission !== "audit.read")
      await expect(page.getByTestId("diagnosis-audit")).toContainText("DOĞRULANAMADI");
    expect(data.calls.some((call) => call.path.endsWith("/subscription"))).toBe(
      permission === "entitlements.read",
    );
    expect(data.calls.some((call) => call.path.endsWith("/sessions"))).toBe(
      permission === "users.sessions.revoke",
    );
    expect(data.calls.some((call) => call.path.endsWith("/audit"))).toBe(
      permission === "audit.read",
    );
  });
}
test("A2 independent API failures keep account visible and recover sections", async ({ page }) => {
  const data = await fixture(page, { failures: ["subscription", "sessions", "audit"] });
  await page.goto(`${WEB}/admin/users/${id}`);
  await expect(page.getByRole("heading", { name: user.fullName, exact: true })).toBeVisible();
  await expect(page.getByTestId("diagnosis-subscription")).toContainText("DOĞRULANAMADI");
  await expect(page.getByTestId("admin-user-subscription").getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Kullanıcıya ait yönetici geçmişi" }).getByRole("alert"),
  ).toBeVisible();
  await expect(page.getByText("PRIVATE_INTERNAL_HEALTH_TOKEN")).toHaveCount(0);
  for (const name of ["subscription", "sessions", "audit"]) data.recover(name);
  await page
    .getByTestId("admin-user-subscription")
    .getByRole("button", { name: "Tekrar dene" })
    .click();
  await page.getByRole("button", { name: "Oturumları yenile" }).click();
  await page.getByRole("button", { name: "Geçmişi yenile" }).click();
  await expect(page.getByTestId("diagnosis-subscription")).toContainText("SORUN TESPİT EDİLEMEDİ");
  await expect(page.getByTestId("diagnosis-sessions")).toContainText("1 aktif");
  await expect(page.getByTestId("diagnosis-audit")).toContainText("TESPİT EDİLDİ");
});
test("A2 inactive account, actual mismatch and empty audit stay qualified", async ({ page }) => {
  await fixture(page, { inactive: true, mismatch: true, emptyAudit: true });
  await page.goto(`${WEB}/admin/users/${id}`);
  await expect(page.getByTestId("diagnosis-account")).toContainText("TESPİT EDİLDİ");
  await expect(page.getByTestId("diagnosis-subscription")).toContainText("OLASI NEDEN");
  await expect(page.getByTestId("diagnosis-audit")).toContainText("DOĞRULANAMADI");
  await expect(
    page.getByText("Görüntülenebilir yakın kayıt bulunamadı.", { exact: true }),
  ).toBeVisible();
});
test("A2 moving between users clears account and service context", async ({ page }) => {
  const data = await fixture(page);
  await page.goto(`${WEB}/admin/users/${id}`);
  await expect(page.getByTestId("diagnosis-audit")).toContainText("TESPİT EDİLDİ");
  const modal = await search(page, "other@example.invalid");
  await modal.getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Diğer Kullanıcı", exact: true })).toBeVisible();
  await expect(page.getByTestId("admin-user360").getByText(email, { exact: true })).toHaveCount(0);
  expect(
    data.calls.some(
      (call) => call.path.endsWith("/audit") && call.query.includes(`user=${otherId}`),
    ),
  ).toBe(true);
});
