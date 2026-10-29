import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createDashboardSession,
  loginDashboardSession,
  setDashboardTheme,
  DASHBOARD_WEB_BASE_URL as base,
} from "./dashboard-test-session";

test.use({ viewport: { width: 390, height: 844 } });

// Synthetic runtime probes must never create accounts or write on production.
for (const target of [base, process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api"]) {
  if (!["staging.diewish.com", "localhost", "127.0.0.1"].includes(new URL(target).hostname))
    throw new Error("Mirmir pilot refuses non-staging/non-local hosts");
}

async function framePlacement(mascot: Locator) {
  return mascot.evaluate((node) => {
    const banner = node.closest("[data-dashboard-coach-banner]");
    if (!banner) throw new Error("Missing coach banner");
    const frame = node.getBoundingClientRect();
    const container = banner.getBoundingClientRect();
    // Screenshots may scroll the page. Compare placement inside the banner,
    // with 0.001px precision to remove browser rectangle rounding noise.
    const rounded = (value: number) => Math.round(value * 1000) / 1000;
    return {
      x: rounded(frame.x - container.x),
      y: rounded(frame.y - container.y),
      width: rounded(frame.width),
      height: rounded(frame.height),
    };
  });
}

test("Mirmir default blink preserves layout and selection across two sessions, with no video or movement control", async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const account = await createDashboardSession(page, request);
  const banner = page.locator("[data-dashboard-coach-banner]");
  await banner.scrollIntoViewIfNeeded();
  await expect(banner.locator('[data-mascot="mirmir"]')).toHaveCount(0);
  const classicBox = await banner.boundingBox();
  await page.goto(base + "/profile/mascot");
  await expect(page.getByRole("radio", { name: "Diewish Klasik", exact: true })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Maskot animasyonu" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Mırmır", exact: true }).click();
  await expect(page.getByText("Maskot tercihin kaydedildi.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Mırmır", exact: true })).toBeChecked();
  await page.goto(base + "/dashboard");
  await banner.scrollIntoViewIfNeeded();
  const mascot = banner.locator('[data-mascot="mirmir"]');
  await expect(mascot).toHaveAttribute("data-blinking", "true");
  await expect(mascot.locator("video")).toHaveCount(0);
  await expect(mascot.locator("img")).toHaveCount(2);
  await expect(mascot.locator("svg, animate, feDisplacementMap")).toHaveCount(0);
  expect(await banner.boundingBox()).toMatchObject({
    width: classicBox!.width,
    height: classicBox!.height,
  });
  const openBox = await framePlacement(mascot);
  await mascot.screenshot({ path: testInfo.outputPath("mirmir-default-blink.png") });
  expect(await framePlacement(mascot)).toEqual(openBox);

  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("diewish:app-visibility", { detail: { active: false } })),
  );
  await expect(mascot).toHaveAttribute("data-blinking", "false");
  await expect(mascot.locator("video")).toHaveCount(0);
  expect(await mascot.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("diewish:app-visibility", { detail: { active: true } })),
  );
  await expect(mascot).toHaveAttribute("data-blinking", "true");
  await mascot.evaluate((node) => {
    (node as HTMLElement).style.transform = "translateY(200vh)";
  });
  await expect(mascot).toHaveAttribute("data-blinking", "false");
  await expect(mascot.locator("video")).toHaveCount(0);
  await mascot.evaluate((node) => {
    (node as HTMLElement).style.removeProperty("transform");
  });
  await banner.scrollIntoViewIfNeeded();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(mascot).toHaveAttribute("data-blinking", "false");
  await expect(mascot.locator("video")).toHaveCount(0);
  await expect(mascot.locator("img").first()).toBeVisible();
  expect(await mascot.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const theme of ["dark", "light"] as const) {
    await setDashboardTheme(page, theme);
    await banner.scrollIntoViewIfNeeded();
    await banner.screenshot({ path: testInfo.outputPath(`mirmir-banner-${theme}.png`) });
    expect(
      await mascot
        .locator("img")
        .first()
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    ).toBe(512);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.goto(base + "/ai");
  await expect(page.locator('header [data-mascot="mirmir"]')).toBeVisible();
  await expect(page.locator('header [data-mascot="mirmir"]')).toHaveAttribute(
    "data-blinking",
    "true",
  );
  await expect(page.getByLabel("Mesaj", { exact: true })).toBeVisible();

  const otherContext = await browser.newContext({ viewport: { width: 412, height: 915 } });
  try {
    const other = await otherContext.newPage();
    await loginDashboardSession(other, account.email, account.password);
    await other.goto(base + "/profile/mascot");
    await expect(other.getByRole("radio", { name: "Mırmır", exact: true })).toBeChecked();
    await expect(other.getByRole("switch", { name: "Maskot animasyonu" })).toHaveCount(0);
    await other.getByRole("radio", { name: "Diewish Klasik", exact: true }).click();
    await expect(other.getByRole("radio", { name: "Diewish Klasik", exact: true })).toBeChecked();
    await page.goto(base + "/profile/mascot");
    await expect(page.getByRole("radio", { name: "Diewish Klasik", exact: true })).toBeChecked();
    await page.goto(base + "/dashboard");
    await expect(banner.locator('[data-mascot="mirmir"]')).toHaveCount(0);
    await other.getByRole("radio", { name: "Mırmır", exact: true }).click();
    await expect(other.getByRole("radio", { name: "Mırmır", exact: true })).toBeChecked();
    await page.goto(base + "/profile/mascot");
    await expect(page.getByRole("radio", { name: "Mırmır", exact: true })).toBeChecked();
    await page.route("**/api/account/mascot", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      return route.fulfill({
        status: 503,
        json: { success: false, error: { code: "TEST_FAILURE", message: "Test failure" } },
      });
    });
    await page.getByRole("radio", { name: "Diewish Klasik", exact: true }).click();
    await expect(
      page.getByText("Tercihin kaydedilemedi. Lütfen tekrar dene.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "Maskot tercihin doğrulanamadı" }),
    ).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Mırmır", exact: true })).toBeChecked();
    await page.unroute("**/api/account/mascot");
    await expect(page.getByRole("radio", { name: "Diewish Klasik", exact: true })).toBeEnabled();
    await page.getByRole("radio", { name: "Diewish Klasik", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Diewish Klasik", exact: true })).toBeChecked();
    await page.goto(base + "/dashboard");
    await expect(banner.locator('[data-mascot="mirmir"]')).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});

test("Dost persists across account sessions and a failed save retains the confirmed choice", async ({
  page,
  request,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const account = await createDashboardSession(page, request);
  const otherContext = await browser.newContext({ viewport: { width: 412, height: 915 } });
  try {
    await page.goto(base + "/profile/mascot");
    await expect(page.getByRole("radio", { name: "Diewish Klasik", exact: true })).toBeChecked();
    await page.getByRole("radio", { name: "Dost", exact: true }).click();
    await expect(page.getByText("Maskot tercihin kaydedildi.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Dost", exact: true })).toBeChecked();
    await page.goto(base + "/dashboard");
    const d = page.locator('[data-dashboard-coach-banner] [data-mascot="dost"]');
    await d.scrollIntoViewIfNeeded();
    await expect(d).toHaveAttribute("data-blinking", "false");
    await expect(d.locator("img")).toHaveJSProperty("naturalWidth", 512);
    await d.screenshot({ path: info.outputPath("dost-saved-pose.png") });
    const other = await otherContext.newPage();
    await loginDashboardSession(other, account.email, account.password);
    await other.goto(base + "/profile/mascot");
    await expect(other.getByRole("radio", { name: "Dost", exact: true })).toBeChecked();
    await page.goto(base + "/profile/mascot");
    await page.route("**/api/account/mascot", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      return route.fulfill({
        status: 503,
        json: { success: false, error: { code: "TEST_FAILURE", message: "Test failure" } },
      });
    });
    await page.getByRole("radio", { name: "Mırmır", exact: true }).click();
    await expect(
      page.getByText("Tercihin kaydedilemedi. Lütfen tekrar dene.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "Maskot tercihin doğrulanamadı" }),
    ).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Dost", exact: true })).toBeChecked();
    await page.unroute("**/api/account/mascot");
    await expect(page.getByRole("radio", { name: "Dost", exact: true })).toBeChecked();
    await other.getByRole("radio", { name: "Diewish Klasik", exact: true }).click();
    await expect(other.getByText("Maskot tercihin kaydedildi.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Diewish Klasik", exact: true })).toBeChecked();
  } finally {
    await otherContext.close();
  }
});

// Real React UI + HTTP client, with all APIs intercepted locally. No account or DB writes.
async function errorFixture(page: Page) {
  const origin = new URL(base).origin;
  if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
    throw new Error("M1 error simulations require a local frontend");
  let releasePatch = () => {};
  let patchGate = Promise.resolve();
  const state = {
    getStatus: 200,
    patchStatus: 200,
    sessionExpired: false,
    preferences: { mascotId: "dost", animationEnabled: false },
    gets: 0,
    patches: [] as { mascotId: string }[],
    hold() {
      patchGate = new Promise<void>((resolve) => {
        releasePatch = resolve;
      });
    },
    release() {
      releasePatch();
    },
  };
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const ok = (data: unknown) => route.fulfill({ json: { success: true, data } });
    const fail = (status: number) =>
      route.fulfill({
        status,
        json: {
          success: false,
          error: { code: "SYNTHETIC_FAILURE", message: "Synthetic failure" },
        },
      });
    if (url.pathname === "/api/auth/refresh-token") {
      if (state.sessionExpired) return fail(401);
      return ok({
        user: {
          id: "mascot-ui-a",
          fullName: "Maskot Testi",
          email: "mascot-ui@example.invalid",
          role: "USER",
          isActive: true,
          onboardingCompleted: true,
        },
        tokens: { accessToken: "synthetic-ui-token", tokenType: "Bearer", expiresIn: "1h" },
      });
    }
    if (url.pathname === "/api/legal/consents")
      return ok({ items: [], allMandatoryGranted: true, missingMandatory: [] });
    if (url.pathname === "/api/legal/documents") return ok({ documents: [] });
    if (url.pathname === "/api/account/mascot") {
      if (route.request().method() === "PATCH") {
        const input = route.request().postDataJSON() as { mascotId: string };
        state.patches.push(input);
        const status = state.patchStatus;
        await patchGate;
        if (status !== 200) return fail(status);
        state.preferences = { ...state.preferences, ...input };
      } else {
        state.gets++;
        if (state.getStatus !== 200) return fail(state.getStatus);
      }
      return ok({ preferences: state.preferences });
    }
    return fail(503); // Never fall through to a real backend for unrelated APIs.
  });
  return state;
}

test.describe("M1 local error contract", () => {
  for (const status of [422, 503]) {
    test(`PATCH ${status} shows only the save error and allows a confirmed retry`, async ({
      page,
    }) => {
      const state = await errorFixture(page);
      state.patchStatus = status;
      await page.goto(base + "/profile/mascot");
      const dost = page.getByRole("radio", { name: "Dost", exact: true });
      const mirmir = page.getByRole("radio", { name: "Mırmır", exact: true });
      const readError = page
        .getByRole("alert")
        .filter({ hasText: "Maskot tercihin doğrulanamadı" });
      await expect(page.getByRole("radio")).toHaveCount(16);
      await expect(dost).toBeChecked();
      await mirmir.click();
      await expect(
        page.getByText("Tercihin kaydedilemedi. Lütfen tekrar dene.", { exact: true }),
      ).toHaveCount(1);
      await expect(readError).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Tekrar yükle", exact: true })).toHaveCount(0);
      await expect(dost).toBeChecked();
      await expect(mirmir).toBeEnabled();
      await expect(page.getByText("Maskot tercihin kaydedildi.", { exact: true })).toHaveCount(0);
      expect(state.patches).toEqual([{ mascotId: "mirmir" }]);

      state.patchStatus = 200;
      state.hold();
      try {
        await mirmir.click();
        await expect(mirmir).toBeDisabled();
        await expect(dost).toBeChecked(); // No optimistic or fabricated save success.
        const gets = state.gets;
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        expect(state.gets).toBe(gets);
        expect(state.patches).toEqual([{ mascotId: "mirmir" }, { mascotId: "mirmir" }]);
      } finally {
        state.release();
      }
      await expect(mirmir).toBeChecked();
      await expect(page.getByText("Maskot tercihin kaydedildi.", { exact: true })).toBeVisible();
      expect(state.preferences).toEqual({ mascotId: "mirmir", animationEnabled: false });
    });
  }

  test("GET failure blocks selection and recovers only after a successful reload", async ({
    page,
  }) => {
    const state = await errorFixture(page);
    state.getStatus = 503;
    await page.goto(base + "/profile/mascot");
    await expect(
      page.getByRole("alert").filter({ hasText: "Maskot tercihin doğrulanamadı" }),
    ).toBeVisible();
    for (const radio of await page.getByRole("radio").all()) await expect(radio).toBeDisabled();
    await expect(
      page.getByText("Tercihin kaydedilemedi. Lütfen tekrar dene.", { exact: true }),
    ).toHaveCount(0);
    expect(state.patches).toHaveLength(0);
    state.getStatus = 200;
    await page.getByRole("button", { name: "Tekrar yükle", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Dost", exact: true })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Mırmır", exact: true })).toBeEnabled();
    await expect(
      page.getByRole("alert").filter({ hasText: "Maskot tercihin doğrulanamadı" }),
    ).toHaveCount(0);
    expect(state.patches).toHaveLength(0);
  });

  test("session loss during PATCH never reports a saved preference", async ({ page }) => {
    const state = await errorFixture(page);
    await page.goto(base + "/profile/mascot");
    await expect(page.getByRole("radio", { name: "Dost", exact: true })).toBeChecked();
    state.patchStatus = 401;
    state.sessionExpired = true;
    await page.getByRole("radio", { name: "Mırmır", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Maskot tercihin kaydedildi.", { exact: true })).toHaveCount(0);
    expect(state.preferences.mascotId).toBe("dost");
    expect(state.patches).toEqual([{ mascotId: "mirmir" }]);
  });
});
