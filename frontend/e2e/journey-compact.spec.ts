import { expect, test } from "@playwright/test";
import {
  createDashboardSession,
  setDashboardTheme,
} from "./dashboard-test-session";

test("Journey stays compact by default and expands/collapses with keyboard controls", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await createDashboardSession(page, request, { workScheduleType: "VARIABLE_SHIFT" });

  const section = page.locator("[data-daily-journey-section]");
  await expect(section).toHaveAttribute("data-journey-status", "actionable", {
    timeout: 20_000,
  });
  await expect(section.locator("[data-journey-row]")).toHaveCount(1);

  const toggle = section.locator("[data-journey-details-toggle]");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.focus();
  await expect(toggle).toBeFocused();

  await toggle.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(await section.locator("[data-journey-row]").count()).toBeGreaterThan(1);

  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(section.locator("[data-journey-row]")).toHaveCount(1);

  for (const [width, height] of [
    [320, 700],
    [360, 800],
    [390, 844],
    [412, 915],
    [430, 932],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(section.locator("[data-journey-row]")).toHaveCount(1);
    const geometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      cardHeight:
        document.querySelector("[data-daily-journey-card]")?.getBoundingClientRect().height ?? 0,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.cardHeight).toBeLessThanOrEqual(310);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await setDashboardTheme(page, "dark");
  await expect(section.locator("[data-journey-row]")).toHaveCount(1);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await setDashboardTheme(page, "light");
});
