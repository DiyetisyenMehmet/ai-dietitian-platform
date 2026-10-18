import { expect, test, type Page } from "@playwright/test";
const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3018";
const boundary = "2026-10-18T08:00:00.000Z";
const old = "2026-10-17T08:00:00.000Z";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function row(n: number, read = false) {
  return {
    id: id(n),
    type: n === 3 ? "WATER_REMINDER" : "PROACTIVE_MESSAGE",
    title: `Bildirim ${n}`,
    body: `Sentetik içerik ${n}`,
    scheduledFor: old,
    deliveredAt: old,
    readAt: read ? old : null,
  };
}
async function fixture(page: Page, native = false) {
  const state = {
    rows: [row(1), row(2), row(3, true)],
    calls: 0,
    fail: false,
    loseResponse: false,
    gate: null as Promise<void> | null,
  };
  if (native)
    await page.addInitScript(
      ({ old, serverId }) => {
        const key = "app8-native-fixture";
        if (!localStorage.getItem(key))
          localStorage.setItem(
            key,
            JSON.stringify([
              {
                id: "push",
                serverId,
                title: "Bildirim 1",
                body: "Sentetik içerik 1",
                target: "/ai",
                occurredAt: Date.parse(old),
                readAt: null,
              },
              {
                id: "local-water",
                serverId: null,
                title: "Yerel su",
                body: "Sentetik su",
                target: "/dashboard",
                occurredAt: Date.parse(old),
                readAt: null,
              },
            ]),
          );
        Object.assign(window, {
          DiewishReminders: {
            notificationInboxJson: () => localStorage.getItem(key) || "[]",
            markNotificationRead: (id: string) => {
              const rows = JSON.parse(localStorage.getItem(key) || "[]");
              for (const row of rows) if (row.id === id) row.readAt ||= Date.now();
              localStorage.setItem(key, JSON.stringify(rows));
            },
            clearNotificationInbox: () => localStorage.removeItem(key),
          },
        });
      },
      { old, serverId: id(1) },
    );
  let signedIn = true;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      method = route.request().method();
    const ok = (data: unknown) => route.fulfill({ json: { success: true, data } });
    const session = {
      user: {
        id: "app8-owner",
        fullName: "Sentetik Hesap",
        email: "app8@example.invalid",
        role: "USER",
        isActive: true,
        onboardingCompleted: true,
        emailVerified: true,
        createdAt: old,
      },
      tokens: { accessToken: "app8-synthetic", tokenType: "Bearer", expiresIn: "15m" },
    };
    if (path.endsWith("/auth/logout")) {
      signedIn = false;
      return ok({});
    }
    if (path.endsWith("/auth/login")) {
      signedIn = true;
      return ok(session);
    }
    if (path.endsWith("/auth/refresh-token"))
      return signedIn
        ? ok(session)
        : route.fulfill({
            status: 401,
            json: { success: false, error: { code: "UNAUTHORIZED", message: "Synthetic logout" } },
          });
    if (path.endsWith("/legal/consents")) return ok({ allMandatoryGranted: false, items: [] });
    if (path.endsWith("/notifications/read-all")) {
      state.calls++;
      expect(method).toBe("PATCH");
      expect(route.request().postDataJSON()).toEqual({ before: boundary });
      if (state.gate) await state.gate;
      if (!state.fail || state.loseResponse)
        for (const row of state.rows)
          if (!row.readAt && row.deliveredAt < boundary) row.readAt = boundary;
      if (state.fail)
        return route.fulfill({
          status: 503,
          json: { success: false, error: { code: "OFFLINE", message: "Synthetic failure" } },
        });
      return ok({ updatedCount: 2 });
    }
    if (path.endsWith("/notifications") && method === "GET")
      return ok({
        notifications: state.rows,
        unreadCount: state.rows.filter((row) => !row.readAt).length,
        readBefore: boundary,
      });
    if (path.endsWith("/identity/firebase-config")) return ok({ configured: false, config: null });
    return ok({});
  });
  return state;
}
for (const width of [390, 412, 430, 1440]) {
  test(`mixed Coach inbox bulk action, counters and persistence at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const api = await fixture(page);
    await page.goto(base + "/notifications");
    const action = page.getByRole("button", { name: "Tümünü okundu işaretle", exact: true });
    await expect(action).toBeVisible();
    await expect(page.getByText("2 okunmamış bildirim", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    let release!: () => void;
    api.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await action.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect.poll(() => api.calls).toBe(1);
    await expect(page.getByRole("button", { name: "İşaretleniyor…" })).toBeDisabled();
    const newer = row(4);
    newer.deliveredAt = "2026-10-18T08:00:00.001Z";
    api.rows.push(newer);
    release();
    await expect(page.getByText("1 okunmamış bildirim", { exact: true })).toBeVisible();
    for (const n of [1, 2, 3, 4])
      await expect(page.getByText(`Sentetik içerik ${n}`, { exact: true })).toBeVisible();
    expect(api.rows[2].readAt).toBe(old);
    expect(api.rows[3].readAt).toBeNull();
    await page.reload();
    await expect(page.getByText("1 okunmamış bildirim", { exact: true })).toBeVisible();
    // Re-entry uses a new authenticated browser session, the same persisted server rows.
    await page.goto(base + "/profile");
    await page.getByRole("button", { name: "Çıkış yap", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("E-posta", { exact: true }).fill("app8@example.invalid");
    await page.getByLabel("Şifre", { exact: true }).fill("Synthetic-only-password!");
    await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto(base + "/notifications");
    await expect(page.getByText("1 okunmamış bildirim", { exact: true })).toBeVisible();
  });
}
test("zero unread and empty inbox never expose the bulk action", async ({ page }) => {
  const api = await fixture(page);
  api.rows.forEach((row) => {
    row.readAt = old;
  });
  await page.goto(base + "/notifications");
  await expect(page.getByText("Sentetik içerik 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tümünü okundu işaretle" })).toHaveCount(0);
  api.rows = [];
  await page.reload();
  await expect(page.getByText("Henüz bildirimin yok", { exact: true })).toBeVisible();
  expect(api.calls).toBe(0);
});
for (const committed of [false, true])
  test(`failed/uncertain response is reconciled without a success message, committed=${committed}`, async ({
    page,
  }) => {
    const api = await fixture(page);
    api.fail = true;
    api.loseResponse = committed;
    await page.goto(base + "/notifications");
    await page.getByRole("button", { name: "Tümünü okundu işaretle", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("doğrulanamadı");
    if (!committed)
      await expect(page.getByText("2 okunmamış bildirim", { exact: true })).toBeVisible();
    else await expect(page.getByRole("button", { name: "Tümünü okundu işaretle" })).toHaveCount(0);
    expect(api.calls).toBe(1);
  });
test("existing Android bridge merges push/server rows and preserves a local arrival during the operation", async ({
  page,
}) => {
  const api = await fixture(page, true);
  await page.goto(base + "/notifications");
  await expect(page.getByText("3 okunmamış bildirim", { exact: true })).toBeVisible();
  let release!: () => void;
  api.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.getByRole("button", { name: "Tümünü okundu işaretle", exact: true }).click();
  await expect.poll(() => api.calls).toBe(1);
  await page.evaluate(() => {
    const key = "app8-native-fixture",
      rows = JSON.parse(localStorage.getItem(key) || "[]");
    rows.push({
      id: "new-local",
      title: "Yeni yerel",
      body: "Yeni geldi",
      target: "/dashboard",
      occurredAt: Date.now(),
      readAt: null,
    });
    localStorage.setItem(key, JSON.stringify(rows));
  });
  release();
  await expect(page.getByText("1 okunmamış bildirim", { exact: true })).toBeVisible();
  const rows = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("app8-native-fixture") || "[]"),
  );
  expect(rows.slice(0, 2).every((row: { readAt: number | null }) => row.readAt)).toBeTruthy();
  expect(rows[2].readAt).toBeNull();
  await page.reload();
  await expect(page.getByText("1 okunmamış bildirim", { exact: true })).toBeVisible();
});
