import { expect, test } from "@playwright/test";

import {
  createDashboardSession,
  setDashboardTheme,
} from "./dashboard-test-session";

test.use({
  viewport: { width: 390, height: 844 },
  colorScheme: "light",
});

test("real dashboard food and progress cards keep text and chevron geometry across themes", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await createDashboardSession(page, request);

  for (const kind of ["food", "progress"] as const) {
    const card = page.locator(
      `[data-dashboard-live-feature-card][data-kind="${kind}"]`,
    );
    const texts = card.locator("[data-dashboard-live-feature-text]");
    const chevron = card.locator("[data-dashboard-feature-chevron]");

    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute("data-locale", "tr");
    await expect(card).toHaveAttribute("data-frame-aspect", "21:5");
    await expect(card.locator("[data-dashboard-live-feature-link]")).toHaveCount(1);
    await expect(texts).toHaveCount(3);
    await expect(chevron).toHaveCount(1);

    const cardBox = await card.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.height).toBeCloseTo(cardBox!.width / 4.2, 1);

    await setDashboardTheme(page, "light");
    await expect(
      card.locator('[data-dashboard-live-feature-stage][data-theme="light"]'),
    ).toBeVisible();
    await expect(
      card.locator('[data-dashboard-live-feature-stage][data-theme="dark"]'),
    ).toBeHidden();

    const before = await texts.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }),
    );
    const chevronBefore = await chevron.boundingBox();
    expect(chevronBefore).not.toBeNull();

    await setDashboardTheme(page, "dark");
    await expect(
      card.locator('[data-dashboard-live-feature-stage][data-theme="light"]'),
    ).toBeHidden();
    await expect(
      card.locator('[data-dashboard-live-feature-stage][data-theme="dark"]'),
    ).toBeVisible();

    const after = await texts.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }),
    );
    const chevronAfter = await chevron.boundingBox();
    expect(chevronAfter).not.toBeNull();

    before.forEach((box, index) => {
      expect(after[index].x).toBeCloseTo(box.x, 2);
      expect(after[index].y).toBeCloseTo(box.y, 2);
      expect(after[index].width).toBeCloseTo(box.width, 2);
      expect(after[index].height).toBeCloseTo(box.height, 2);
    });

    expect(chevronAfter!.x).toBeCloseTo(chevronBefore!.x, 2);
    expect(chevronAfter!.y).toBeCloseTo(chevronBefore!.y, 2);
    expect(chevronAfter!.width).toBeCloseTo(chevronBefore!.width, 2);
    expect(chevronAfter!.height).toBeCloseTo(chevronBefore!.height, 2);
  }
});
