import { expect, test } from "@playwright/test";
import { createDashboardSession, setDashboardTheme } from "./dashboard-test-session";

test("dashboard cards reserve separate copy/artwork regions and navigate", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await createDashboardSession(page, request);
  for (const width of [320, 390, 412, 768]) {
    await page.setViewportSize({ width, height: 915 });
    for (const theme of ["light", "dark"] as const) {
      await setDashboardTheme(page, theme);
      for (const kind of ["food", "progress"]) {
        const card = page.locator(`[data-kind="${kind}"][data-dashboard-live-feature-card]`);
        await expect(card).toHaveCount(1);
        const copy = await card.locator(".dashboard-card-copy").boundingBox();
        const artwork = await card.locator(".dashboard-card-illustration").boundingBox();
        expect(copy!.x + copy!.width).toBeLessThanOrEqual(artwork!.x);
        await expect(card.locator("[data-dashboard-live-feature-link]")).toHaveCount(1);
        await expect(card.locator(".dashboard-card-copy")).toHaveCSS("user-select", "none");
      }
      const coach = page.locator("[data-dashboard-coach-banner]");
      const action = coach.getByRole("link", { name: /Hemen Sor/ });
      await expect(action).toBeVisible();
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page
    .locator("[data-dashboard-coach-banner]")
    .getByRole("link", { name: /Hemen Sor/ })
    .click();
  await expect(page).toHaveURL(/\/ai(?:$|\?)/);
});
