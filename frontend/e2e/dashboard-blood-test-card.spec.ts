import { expect, test } from "@playwright/test";
import { createDashboardSession, setDashboardTheme } from "./dashboard-test-session";

test("blood preview reflows inside the real dashboard theme slot and navigates", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await createDashboardSession(page, request);
  for (const width of [320, 390, 412, 430, 768]) {
    await page.setViewportSize({ width, height: 915 });
    for (const theme of ["light", "dark"] as const) {
      await setDashboardTheme(page, theme);
      await page.evaluate(() => document.fonts.ready);
      const card = page.locator("[data-blood-test-card]:visible");
      await expect(card).toHaveCount(1);
      await expect(card).toHaveAttribute("data-theme", theme);
      await expect(card.getByText("Örnek görünüm")).toBeVisible();
      await expect(card.locator("[data-blood-test-tube]")).toBeVisible();
      const slotBox = await page.locator("[data-blood-test-theme-slot]").boundingBox();
      const cardBox = await card.boundingBox();
      expect(slotBox!.height).toBeCloseTo(cardBox!.height, 1);
      if ([390, 412, 430].includes(width)) {
        const copy = (await card.locator(".dashboard-card-copy").boundingBox())!;
        const summary = (await card.locator("[data-blood-test-summary]").boundingBox())!;
        const preview = (await card.locator("[data-blood-test-preview]").boundingBox())!;
        const tube = (await card.locator("[data-blood-test-tube]").boundingBox())!;
        expect(summary.x).toBeGreaterThanOrEqual(copy.x + copy.width);
        expect(tube.x).toBeGreaterThanOrEqual(preview.x + preview.width + 3);
        expect(tube.width).toBeGreaterThanOrEqual(25);
        expect(tube.width).toBeLessThanOrEqual(27);
        expect(cardBox!.height).toBeLessThanOrEqual(118);
      }
      for (const row of await card.locator("[data-blood-test-row]").all()) {
        const label = (await row.locator("dt").boundingBox())!;
        const value = (await row.locator("dd").boundingBox())!;
        const beside = label.x + label.width <= value.x + 1;
        const below = label.y + label.height <= value.y + 1;
        expect(beside || below).toBe(true);
      }
    }
  }
  await page.locator("[data-blood-test-card]:visible [data-blood-test-link]").click();
  await expect(page).toHaveURL(/\/profile\/blood-tests(?:$|\?)/);
});
