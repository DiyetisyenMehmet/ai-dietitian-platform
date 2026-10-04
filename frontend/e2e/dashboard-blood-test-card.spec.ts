import { expect, test } from "@playwright/test";

import {
  createDashboardSession,
  setDashboardTheme,
} from "./dashboard-test-session";

test.use({
  viewport: { width: 390, height: 844 },
  colorScheme: "light",
});

test("real dashboard blood-test card keeps the compact shared height and non-interactive text in light and dark themes", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await createDashboardSession(page, request);

  const slot = page.locator("[data-blood-test-theme-slot]");
  await expect(slot).toBeVisible();

  for (const theme of ["light", "dark"] as const) {
    await setDashboardTheme(page, theme);

    const card = slot.locator(
      `[data-blood-test-card][data-theme="${theme}"]:visible`,
    );
    const texts = card.locator("[data-blood-test-live-text]");

    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute("data-locale", "tr");
    await expect(card).toHaveAttribute("data-frame-height", "84px");
    await expect(card).toHaveAttribute("data-dashboard-fixed-geometry", "");
    await expect(card.locator("[data-blood-test-link]")).toHaveCount(1);
    await expect(texts).toHaveCount(16);

    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeCloseTo(84, 1);

    const state = await texts.evaluateAll((nodes) =>
      nodes.map((node) => ({
        inAnchor: Boolean(node.closest("a")),
        userSelect: getComputedStyle(node).userSelect,
        pointerEvents: getComputedStyle(node).pointerEvents,
        textSizeAdjust:
          getComputedStyle(node).getPropertyValue("-webkit-text-size-adjust")
          || getComputedStyle(node).getPropertyValue("text-size-adjust"),
      })),
    );

    for (const item of state) {
      expect(item.inAnchor).toBe(false);
      expect(item.userSelect).toBe("none");
      expect(item.pointerEvents).toBe("none");
      expect(item.textSizeAdjust.trim()).toBe("100%");
    }
  }
});


test("blood-test compact geometry remains aligned at 412x915 and its route stays clickable", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 412, height: 915 });
  await createDashboardSession(page, request);

  for (const theme of ["light", "dark"] as const) {
    await setDashboardTheme(page, theme);
    const card = page.locator(`[data-blood-test-card][data-theme="${theme}"]:visible`);
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeCloseTo(84, 1);

    const rows = card.locator("[data-blood-test-row]");
    const rowBoxes = await rows.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
      }),
    );
    for (let index = 0; index < rowBoxes.length; index += 2) {
      const label = rowBoxes[index];
      const value = rowBoxes[index + 1];
      expect(label.bottom).toBeGreaterThan(label.top);
      expect(value.bottom).toBeGreaterThan(value.top);
      expect(label.right).toBeLessThanOrEqual(value.left + 1);
    }
  }

  await setDashboardTheme(page, "light");
  const card = page.locator('[data-blood-test-card][data-theme="light"]:visible');
  await expect(card).toHaveCount(1);
  await card.locator("[data-blood-test-link]").click();
  await expect(page).toHaveURL(/\/profile\/blood-tests(?:$|\?)/);
});
