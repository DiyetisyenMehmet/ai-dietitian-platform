import { expect, test, type Locator } from "@playwright/test";
import {
  createDashboardSession,
  loginDashboardSession,
  setDashboardTheme,
  DASHBOARD_WEB_BASE_URL as base,
} from "./dashboard-test-session";

test.use({ viewport: { width: 390, height: 844 } });

async function frameState(mascot: Locator, time: number) {
  return mascot.evaluate((node, currentTime) => {
    for (const animation of node.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = currentTime;
    }
    return Array.from(node.querySelectorAll("img")).map((img) => getComputedStyle(img).visibility);
  }, time);
}

test("Mirmir pilot preserves layout, persists across two sessions, and stops all blink conditions", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180_000);
  const account = await createDashboardSession(page, request);
  const banner = page.locator("[data-dashboard-coach-banner]");
  await banner.scrollIntoViewIfNeeded();
  await expect(banner.locator('[data-mascot="mirmir"]')).toHaveCount(0);
  const classicBox = await banner.boundingBox();
  await page.goto(base + "/profile/mascot");
  await expect(page.getByRole("radio", { name: "Diewish Klasik", exact: true })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Maskot animasyonu" })).toBeChecked();
  await page.getByRole("radio", { name: "Mırmır", exact: true }).click();
  await expect(page.getByText("Maskot tercihin kaydedildi.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Mırmır", exact: true })).toBeChecked();
  await page.goto(base + "/dashboard");
  await banner.scrollIntoViewIfNeeded();
  const mascot = banner.locator('[data-mascot="mirmir"]');
  await expect(mascot).toHaveAttribute("data-blinking", "true");
  expect(await banner.boundingBox()).toMatchObject({
    width: classicBox!.width,
    height: classicBox!.height,
  });
  const openBox = await mascot.boundingBox();
  expect(await frameState(mascot, 100)).toEqual(["visible", "hidden"]);
  expect(await frameState(mascot, 5500)).toEqual(["hidden", "visible"]);
  expect(await mascot.boundingBox()).toEqual(openBox);
  expect(await frameState(mascot, 0)).toEqual(["visible", "hidden"]);

  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("diewish:app-visibility", { detail: { active: false } })),
  );
  await expect(mascot).toHaveAttribute("data-blinking", "false");
  expect(await mascot.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("diewish:app-visibility", { detail: { active: true } })),
  );
  await expect(mascot).toHaveAttribute("data-blinking", "true");
  await mascot.evaluate((node) => {
    (node as HTMLElement).style.transform = "translateY(200vh)";
  });
  await expect(mascot).toHaveAttribute("data-blinking", "false");
  await mascot.evaluate((node) => {
    (node as HTMLElement).style.removeProperty("transform");
  });
  await banner.scrollIntoViewIfNeeded();
  await expect(mascot).toHaveAttribute("data-blinking", "true");

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await frameState(mascot, 5500)).toEqual(["visible", "hidden"]);
  expect(await mascot.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const theme of ["dark", "light"] as const) {
    await setDashboardTheme(page, theme);
    await banner.scrollIntoViewIfNeeded();
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
  await expect(page.getByLabel("Mesaj", { exact: true })).toBeVisible();

  const otherContext = await browser.newContext({ viewport: { width: 412, height: 915 } });
  try {
    const other = await otherContext.newPage();
    await loginDashboardSession(other, account.email, account.password);
    await other.goto(base + "/profile/mascot");
    await expect(other.getByRole("radio", { name: "Mırmır", exact: true })).toBeChecked();
    await other.getByRole("switch", { name: "Maskot animasyonu" }).click();
    await expect(other.getByRole("switch", { name: "Maskot animasyonu" })).not.toBeChecked();
    await expect(other.getByRole("switch", { name: "Maskot animasyonu" })).toBeEnabled();
    await page.goto(base + "/profile/mascot");
    await expect(page.getByRole("switch", { name: "Maskot animasyonu" })).not.toBeChecked();
    await page.goto(base + "/dashboard");
    await banner.scrollIntoViewIfNeeded();
    await expect(mascot).toHaveAttribute("data-blinking", "false");
    expect(await mascot.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
    await page.goto(base + "/profile/mascot");
    await page.route("**/api/account/mascot", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      return route.fulfill({
        status: 503,
        json: { success: false, error: { code: "TEST_FAILURE", message: "Test failure" } },
      });
    });
    await page.getByRole("radio", { name: "Diewish Klasik", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Maskot tercihin doğrulanamadı" }),
    ).toBeVisible();
    await expect(page.getByRole("radio", { name: "Mırmır", exact: true })).toBeChecked();
    await page.unroute("**/api/account/mascot");
    await page.getByRole("button", { name: "Tekrar yükle" }).click();
    await expect(page.getByRole("radio", { name: "Diewish Klasik", exact: true })).toBeEnabled();
    await page.getByRole("radio", { name: "Diewish Klasik", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Diewish Klasik", exact: true })).toBeChecked();
    await page.goto(base + "/dashboard");
    await expect(banner.locator('[data-mascot="mirmir"]')).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});
