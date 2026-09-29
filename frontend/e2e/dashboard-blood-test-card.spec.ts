import { expect, test } from "@playwright/test";

import {
  createDashboardSession,
  setDashboardTheme,
} from "./dashboard-test-session";

test.use({
  viewport: { width: 390, height: 844 },
  colorScheme: "light",
});

test("real dashboard blood-test card keeps its 21:5 frame and selectable text in light and dark themes", async ({
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
    await expect(card).toHaveAttribute("data-frame-aspect", "21:5");
    await expect(card.locator("[data-blood-test-link]")).toHaveCount(1);
    await expect(texts).toHaveCount(15);
    await expect(card.locator("[data-dashboard-feature-chevron]")).toHaveCount(1);

    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeCloseTo(box!.width / 4.2, 1);

    const state = await texts.evaluateAll((nodes) =>
      nodes.map((node) => ({
        inAnchor: Boolean(node.closest("a")),
        userSelect: getComputedStyle(node).userSelect,
        pointerEvents: getComputedStyle(node).pointerEvents,
      })),
    );

    for (const item of state) {
      expect(item.inAnchor).toBe(false);
      expect(item.userSelect).toBe("text");
      expect(item.pointerEvents).not.toBe("none");
    }

    const selected = await texts.first().evaluate((node) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return selection?.toString() ?? "";
    });
    expect(selected.trim().length).toBeGreaterThan(0);
  }
});
