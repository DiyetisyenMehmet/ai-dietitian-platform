const { test, expect } = require("@playwright/test");

const WEB = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
test.use({ timezoneId: "UTC" });
const user = {
  id: "00000000-0000-4000-8000-000000009902",
  email: "b2-user@example.com",
  fullName: "B2 Kullanıcı",
  role: "USER",
  isActive: true,
  createdAt: "2026-09-01T12:00:00.000Z",
  lastLoginAt: null,
  emailVerifiedAt: "2026-09-01T12:30:00.000Z",
  onboardingCompleted: true,
  subscriptionTier: "FREE",
};

function baseSubscription(overrides = {}) {
  return {
    currentPlan: "FREE",
    providerPlan: "FREE",
    currentPlanSource: "ACCOUNT_DEFAULT",
    entitlementStatus: "FREE",
    entitlements: ["DIETITIAN_CHAT", "BLOOD_TEST_ANALYSIS", "NUTRITION_PLAN"],
    record: null,
    supportEntitlement: null,
    ...overrides,
  };
}

function activeSupport(updatedAt = "2026-09-30T12:00:00.000Z") {
  return {
    id: "00000000-0000-4000-8000-000000009903",
    tier: "PREMIUM_PLUS",
    status: "ACTIVE",
    grantedAt: "2026-09-30T11:00:00.000Z",
    expiresAt: "2026-10-30T11:00:00.000Z",
    updatedAt,
  };
}

async function setup(page, options = {}) {
  let subscription = options.subscription || baseSubscription();
  let stale = Boolean(options.stale);
  let holdMutation = Boolean(options.holdMutation);
  let releaseMutation;
  const mutationGate = new Promise((resolve) => {
    releaseMutation = resolve;
  });
  let mutationCalls = 0;
  let lastBody = null;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const ok = (data) => route.fulfill({ json: { success: true, data } });

    if (path.endsWith("/auth/refresh-token")) {
      return ok({
        user: {
          id: "admin",
          email: "admin@example.com",
          role: "ADMIN",
          onboardingCompleted: true,
        },
        tokens: { accessToken: "b2-fixture", expiresIn: 900 },
      });
    }

    if (path.endsWith("/admin/session")) {
      const permissions =
        options.permissions ||
        (options.readOnly
          ? ["admin.access", "users.read", "entitlements.read"]
          : [
              "admin.access",
              "users.read",
              "entitlements.read",
              "entitlements.grant",
              "entitlements.revoke",
            ]);
      return ok({
        admin: { id: "admin", email: "admin@example.com", fullName: "Yönetici" },
        roles: options.readOnly ? ["B2_READ_ONLY"] : ["FINANCE"],
        permissions,
        environment: {
          environment: "staging",
          application: "diewish",
          version: "test",
          commit: "b2-test",
        },
      });
    }

    if (path.endsWith(`/admin/users/${user.id}/subscription/support-entitlement`)) {
      mutationCalls += 1;
      lastBody = route.request().postDataJSON();
      if (holdMutation) {
        await mutationGate;
        holdMutation = false;
      }
      if (stale) {
        return route.fulfill({
          status: 409,
          json: { success: false, error: { message: "private stale detail" } },
        });
      }

      if (method === "PUT") {
        const support = {
          ...activeSupport("2026-09-30T13:00:00.000Z"),
          tier: lastBody.tier,
          expiresAt: lastBody.expiresAt,
        };
        subscription = {
          ...subscription,
          currentPlan: lastBody.tier,
          currentPlanSource: "ADMIN_SUPPORT",
          entitlementStatus: "ACTIVE",
          entitlements: [
            "DIETITIAN_CHAT",
            "BLOOD_TEST_ANALYSIS",
            "NUTRITION_PLAN",
            "PRIORITY_SUPPORT",
          ],
          supportEntitlement: support,
        };
        return ok({ supportEntitlement: support });
      }

      const revoked = {
        ...activeSupport("2026-09-30T14:00:00.000Z"),
        status: "REVOKED",
      };
      const providerPlan = subscription.providerPlan;
      subscription = {
        ...subscription,
        currentPlan: providerPlan,
        currentPlanSource:
          subscription.record?.source === "IYZICO_SUBSCRIPTION"
            ? "IYZICO_SUBSCRIPTION"
            : subscription.record?.source === "GOOGLE_PLAY_ENTITLEMENT"
              ? "GOOGLE_PLAY_ENTITLEMENT"
              : "ACCOUNT_DEFAULT",
        entitlementStatus: providerPlan === "FREE" ? "FREE" : "ACTIVE",
        supportEntitlement: revoked,
      };
      return ok({ supportEntitlement: revoked });
    }

    if (path.endsWith(`/admin/users/${user.id}/subscription`)) {
      return ok({ subscription });
    }
    if (path.endsWith(`/admin/users/${user.id}`)) return ok({ user });
    return ok({});
  });

  return {
    mutationCalls: () => mutationCalls,
    lastBody: () => lastBody,
    setStale: (value) => {
      stale = value;
    },
    releaseMutation: () => releaseMutation(),
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
  test(`B2 grant confirmation is responsive and explicit ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const fixture = await setup(page);
    await page.goto(`${WEB}/admin/users/${user.id}`);

    const operations = page.getByTestId("admin-support-entitlement-operations");
    await expect(operations).toBeVisible();
    await operations.getByLabel("Destek planı").selectOption("PREMIUM_PLUS");
    await operations.getByLabel("Destek hakkı bitiş tarihi").fill("2030-01-01T12:00");
    await operations.getByRole("button", { name: "Destek hakkı ver" }).click();

    const modal = page.getByRole("dialog");
    await expect
      .poll(async () => {
        const bounds = await modal.boundingBox();
        return Boolean(
          bounds &&
            bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.x + bounds.width <= width + 1 &&
            bounds.y + bounds.height <= height + 1,
        );
      })
      .toBe(true);
    await expect(modal).toContainText(user.email);
    await expect(modal).toContainText("Mevcut etkin plan: Free");
    await expect(modal).toContainText("Yeni destek planı: Premium Plus");
    await expect(modal).toContainText(
      "Google Play/IYZICO aboneliği ve ödeme kayıtları değiştirilmeyecek.",
    );

    const confirm = modal.getByRole("button", { name: "Onayla ve uygula" });
    await expect(confirm).toBeDisabled();
    await modal.getByLabel("İşlem gerekçesi").fill("Approved support entitlement");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(operations.getByRole("status")).toContainText("işlem kaydı");
    expect(fixture.mutationCalls()).toBe(1);
    expect(fixture.lastBody()).toMatchObject({
      tier: "PREMIUM_PLUS",
      expiresAt: "2030-01-01T12:00:00.000Z",
      expectedUpdatedAt: null,
      reason: "Approved support entitlement",
      confirmed: true,
    });
    await expect(page.getByText("Yönetici / destek hakkı", { exact: true }).first()).toBeVisible();
    await noOverflow(page);
  });
}

test("B2 read-only admin sees state but no mutation controls", async ({ page }) => {
  const fixture = await setup(page, {
    readOnly: true,
    subscription: baseSubscription({
      currentPlan: "PREMIUM_PLUS",
      providerPlan: "FREE",
      currentPlanSource: "ADMIN_SUPPORT",
      entitlementStatus: "ACTIVE",
      supportEntitlement: activeSupport(),
    }),
  });
  await page.goto(`${WEB}/admin/users/${user.id}`);
  await expect(page.getByText("Yönetici / destek hakkı", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("admin-support-entitlement-operations")).toHaveCount(0);
  expect(fixture.mutationCalls()).toBe(0);
});

test("B2 stale state is sanitized and requires reload", async ({ page }) => {
  const fixture = await setup(page, {
    stale: true,
    subscription: baseSubscription({
      currentPlan: "PREMIUM_PLUS",
      providerPlan: "FREE",
      currentPlanSource: "ADMIN_SUPPORT",
      entitlementStatus: "ACTIVE",
      supportEntitlement: activeSupport(),
    }),
  });
  await page.goto(`${WEB}/admin/users/${user.id}`);
  const operations = page.getByTestId("admin-support-entitlement-operations");
  await operations.getByRole("button", { name: "Destek hakkını güncelle" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("İşlem gerekçesi").fill("Update approved support access");
  await modal.getByRole("button", { name: "Onayla ve uygula" }).click();
  await expect(modal.getByRole("alert")).toContainText("Destek hakkı durumu değişti");
  await expect(page.getByText("private stale detail")).toHaveCount(0);
  fixture.setStale(false);
});

test("B2 revoke confirmation preserves provider and sends stale-state token", async ({ page }) => {
  const support = activeSupport();
  const fixture = await setup(page, {
    subscription: baseSubscription({
      currentPlan: "PREMIUM_PLUS",
      providerPlan: "PREMIUM",
      currentPlanSource: "ADMIN_SUPPORT",
      entitlementStatus: "ACTIVE",
      record: {
        status: "ACTIVE",
        provider: "IYZICO",
        source: "IYZICO_SUBSCRIPTION",
        startDate: "2026-09-01T00:00:00.000Z",
        expiryOrRenewalDate: "2026-11-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
        canceledAt: null,
        trial: null,
      },
      supportEntitlement: support,
    }),
  });
  await page.goto(`${WEB}/admin/users/${user.id}`);
  const operations = page.getByTestId("admin-support-entitlement-operations");
  await operations.getByRole("button", { name: "Destek hakkını sonlandır" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("Google Play/IYZICO aboneliği");
  await modal.getByLabel("İşlem gerekçesi").fill("Support issue resolved");
  await modal.getByRole("button", { name: "Onayla ve uygula" }).click();
  await expect(operations.getByRole("status")).toContainText("sonlandırıldı");
  expect(fixture.lastBody()).toMatchObject({
    expectedUpdatedAt: support.updatedAt,
    reason: "Support issue resolved",
    confirmed: true,
  });
  await expect(page.getByText("IYZICO aboneliği", { exact: true })).toBeVisible();
});

test("B2 duplicate submit is blocked while mutation is in flight", async ({ page }) => {
  const fixture = await setup(page, { holdMutation: true });
  await page.goto(`${WEB}/admin/users/${user.id}`);
  const operations = page.getByTestId("admin-support-entitlement-operations");
  await operations.getByLabel("Destek hakkı bitiş tarihi").fill("2030-01-01T12:00");
  await operations.getByRole("button", { name: "Destek hakkı ver" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("İşlem gerekçesi").fill("Approved controlled access");
  const confirm = modal.locator('button[type="submit"]');
  await confirm.click();
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveText("İşleniyor…");
  expect(fixture.mutationCalls()).toBe(1);
  fixture.releaseMutation();
  await expect(operations.getByRole("status")).toContainText("güncellendi");
  expect(fixture.mutationCalls()).toBe(1);
});

for (const tier of ["PREMIUM", "PREMIUM_PLUS"]) {
  test(`B2 finite ${tier} grant refreshes B1 and revoke returns to Free`, async ({ page }) => {
    const fixture = await setup(page);
    await page.goto(`${WEB}/admin/users/${user.id}`);
    const operations = page.getByTestId("admin-support-entitlement-operations");
    await operations.getByLabel("Destek planı").selectOption(tier);
    await operations.getByLabel("Destek hakkı bitiş tarihi").fill("2030-01-01T12:00");
    await operations.getByRole("button", { name: "Destek hakkı ver", exact: true }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("İşlem gerekçesi").fill("Geçici destek erişimi testi");
    await modal.getByRole("button", { name: "Onayla ve uygula" }).click();
    await expect(operations.getByRole("status")).toContainText("güncellendi");
    const label = tier === "PREMIUM" ? "Premium" : "Premium Plus";
    await expect(page.getByTestId("admin-user-subscription")).toContainText(label);
    expect(fixture.lastBody().expiresAt).toBe("2030-01-01T12:00:00.000Z");
    await operations.getByRole("button", { name: "Destek hakkını sonlandır" }).click();
    await modal.getByLabel("İşlem gerekçesi").fill("Geçici destek testi tamamlandı");
    await modal.getByRole("button", { name: "Onayla ve uygula" }).click();
    await expect(operations.getByRole("status")).toContainText("sonlandırıldı");
    await expect(page.getByTestId("admin-user-subscription")).toContainText("Ücretsiz erişim");
    expect(fixture.mutationCalls()).toBe(2);
  });
}

test("B2 missing or past expiry and blank reason never send a mutation", async ({ page }) => {
  const fixture = await setup(page);
  await page.goto(`${WEB}/admin/users/${user.id}`);
  const operations = page.getByTestId("admin-support-entitlement-operations");
  for (const expiry of ["", "2000-01-01T12:00"]) {
    await operations.getByLabel("Destek hakkı bitiş tarihi").fill(expiry);
    await operations.getByRole("button", { name: "Destek hakkı ver", exact: true }).click();
    await expect(operations.getByRole("alert")).toContainText("Gelecekteki bir bitiş tarihi");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(fixture.mutationCalls()).toBe(0);
  }
  await operations.getByLabel("Destek hakkı bitiş tarihi").fill("2030-01-01T12:00");
  await operations.getByRole("button", { name: "Destek hakkı ver", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("İşlem gerekçesi").fill("   ");
  await expect(modal.getByRole("button", { name: "Onayla ve uygula" })).toBeDisabled();
  await modal.getByRole("button", { name: "Vazgeç" }).click();
  expect(fixture.mutationCalls()).toBe(0);
});

for (const permission of ["entitlements.grant", "entitlements.revoke"]) {
  test(`B2 action visibility respects ${permission} independently`, async ({ page }) => {
    const fixture = await setup(page, {
      permissions: ["admin.access", "users.read", "entitlements.read", permission],
      subscription: baseSubscription({
        currentPlan: "PREMIUM_PLUS",
        currentPlanSource: "ADMIN_SUPPORT",
        entitlementStatus: "ACTIVE",
        supportEntitlement: activeSupport(),
      }),
    });
    await page.goto(`${WEB}/admin/users/${user.id}`);
    const operations = page.getByTestId("admin-support-entitlement-operations");
    await expect(operations.getByRole("button", { name: "Destek hakkını güncelle" })).toHaveCount(
      permission === "entitlements.grant" ? 1 : 0,
    );
    await expect(operations.getByRole("button", { name: "Destek hakkını sonlandır" })).toHaveCount(
      permission === "entitlements.revoke" ? 1 : 0,
    );
    expect(fixture.mutationCalls()).toBe(0);
  });
}
