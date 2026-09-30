const { test, expect } = require("@playwright/test");

const WEB = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const user = {
  id: "00000000-0000-4000-8000-000000009901",
  email: "b1-user@example.com",
  fullName: "B1 Kullanıcı",
  role: "USER",
  isActive: true,
  createdAt: "2026-09-01T12:00:00.000Z",
  lastLoginAt: null,
  emailVerifiedAt: "2026-09-01T12:30:00.000Z",
  onboardingCompleted: true,
  subscriptionTier: "FREE",
};

const paid = {
  currentPlan: "PREMIUM_PLUS",
  providerPlan: "PREMIUM_PLUS",
  currentPlanSource: "GOOGLE_PLAY_ENTITLEMENT",
  entitlementStatus: "ACTIVE",
  entitlements: [
    "DIETITIAN_CHAT",
    "BLOOD_TEST_ANALYSIS",
    "NUTRITION_PLAN",
    "PRIORITY_SUPPORT",
  ],
  record: {
    status: "ACTIVE",
    provider: "GOOGLE_PLAY",
    source: "GOOGLE_PLAY_ENTITLEMENT",
    startDate: "2026-09-15T10:00:00.000Z",
    expiryOrRenewalDate: "2026-10-15T10:00:00.000Z",
    cancelAtPeriodEnd: null,
    canceledAt: null,
    trial: null,
  },
  supportEntitlement: null,
};

const free = {
  currentPlan: "FREE",
  providerPlan: "FREE",
  currentPlanSource: "ACCOUNT_DEFAULT",
  entitlementStatus: "FREE",
  entitlements: ["DIETITIAN_CHAT", "BLOOD_TEST_ANALYSIS", "NUTRITION_PLAN"],
  record: null,
  supportEntitlement: null,
};

async function setup(page, options = {}) {
  let subscription = options.subscription || paid;
  let failing = Boolean(options.error);
  let release;
  const hold = options.loading
    ? new Promise((resolve) => {
        release = resolve;
      })
    : Promise.resolve();
  let subscriptionCalls = 0;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const ok = (data) => route.fulfill({ json: { success: true, data } });

    if (path.endsWith("/auth/refresh-token")) {
      return ok({
        user: {
          id: "admin",
          email: "admin@example.com",
          role: "ADMIN",
          onboardingCompleted: true,
        },
        tokens: { accessToken: "b1-fixture", expiresIn: 900 },
      });
    }
    if (path.endsWith("/admin/session")) {
      return ok({
        admin: { id: "admin", email: "admin@example.com", fullName: "Yönetici" },
        roles: options.noEntitlementPermission ? ["SUPPORT"] : ["FINANCE"],
        permissions: options.noEntitlementPermission
          ? ["admin.access", "users.read"]
          : ["admin.access", "users.read", "entitlements.read"],
        environment: {
          environment: "staging",
          application: "diewish",
          version: "test",
          commit: "b1-test",
        },
      });
    }
    if (path.endsWith(`/admin/users/${user.id}/subscription`)) {
      subscriptionCalls += 1;
      await hold;
      if (failing) {
        return route.fulfill({
          status: 500,
          json: { success: false, error: { message: "B1 PRIVATE INTERNAL STACK" } },
        });
      }
      return ok({ subscription });
    }
    if (path.endsWith(`/admin/users/${user.id}`)) return ok({ user });
    return ok({});
  });

  return {
    release: () => release?.(),
    recover: () => {
      failing = false;
    },
    setSubscription: (next) => {
      subscription = next;
    },
    subscriptionCalls: () => subscriptionCalls,
  };
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const [width, height] of [
  [390, 844],
  [412, 915],
  [768, 1024],
  [1440, 900],
]) {
  test(`B1 paid subscription renders responsively ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setup(page, { subscription: paid });
    await page.goto(`${WEB}/admin/users/${user.id}`);
    const section = page.getByTestId("admin-user-subscription");
    await expect(
      section.getByRole("heading", { name: "Abonelik ve hak paketi" }),
    ).toBeVisible();
    await expect(section.getByText("Premium Plus", { exact: true }).first()).toBeVisible();
    await expect(section.getByText("Aktif ücretli erişim", { exact: true })).toBeVisible();
    await expect(section.getByText("Google Play", { exact: true })).toBeVisible();
    await expect(section.getByText("Öncelikli destek", { exact: true })).toBeVisible();
    await expect(
      section.getByRole("button", { name: /Premium|plan|iptal|refund|uzat/i }),
    ).toHaveCount(0);
    await noOverflow(page);
  });
}

test("B1 free user without subscription record renders safe empty state", async ({ page }) => {
  await setup(page, { subscription: free });
  await page.goto(`${WEB}/admin/users/${user.id}`);
  const section = page.getByTestId("admin-user-subscription");
  await expect(section.getByText("Free", { exact: true }).first()).toBeVisible();
  await expect(section.getByText("Free erişim", { exact: true })).toBeVisible();
  await expect(section.getByText("Kayıt yok", { exact: true })).toBeVisible();
  await expect(section.getByText("Hesap varsayılanı", { exact: true })).toBeVisible();
  await expect(section.getByText("Bilgi yok", { exact: true })).toHaveCount(5);
});

test("B1 entitlement permission hides section and prevents subscription request", async ({ page }) => {
  const fixture = await setup(page, { noEntitlementPermission: true });
  await page.goto(`${WEB}/admin/users/${user.id}`);
  await expect(page.getByRole("heading", { name: "Kullanıcı detayı" })).toBeVisible();
  await expect(page.getByTestId("admin-user-subscription")).toHaveCount(0);
  expect(fixture.subscriptionCalls()).toBe(0);
});

test("B1 subscription loading, sanitized error and retry", async ({ page }) => {
  const fixture = await setup(page, { loading: true, error: true, subscription: paid });
  await page.goto(`${WEB}/admin/users/${user.id}`);
  await expect(page.getByText("Abonelik bilgileri yükleniyor")).toBeAttached();
  fixture.release();
  const section = page.getByTestId("admin-user-subscription");
  await expect(section.getByRole("alert")).toContainText("Abonelik bilgileri yüklenemedi");
  await expect(page.getByText("B1 PRIVATE INTERNAL STACK")).toHaveCount(0);
  fixture.recover();
  await section.getByRole("button", { name: "Tekrar dene" }).click();
  await expect(section.getByText("Premium Plus", { exact: true }).first()).toBeVisible();
});
