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
    await expect(card).toHaveAttribute("data-dashboard-fixed-geometry", "");
    await expect(card.locator("[data-dashboard-live-feature-link]")).toHaveCount(1);
    await expect(texts).toHaveCount(3);

    const textInteraction = await texts.evaluateAll((nodes) =>
      nodes.map((node) => ({
        userSelect: getComputedStyle(node).userSelect,
        pointerEvents: getComputedStyle(node).pointerEvents,
        textSizeAdjust:
          getComputedStyle(node).getPropertyValue("-webkit-text-size-adjust")
          || getComputedStyle(node).getPropertyValue("text-size-adjust"),
      })),
    );
    for (const item of textInteraction) {
      expect(item.userSelect).toBe("none");
      expect(item.pointerEvents).toBe("none");
      expect(item.textSizeAdjust.trim()).toBe("100%");
    }
    await expect(chevron).toHaveCount(1);

    await setDashboardTheme(page, "light");
    await expect(
      card.locator('[data-dashboard-live-feature-stage][data-theme="light"]'),
    ).toBeVisible();
    await expect(
      card.locator('[data-dashboard-live-feature-stage][data-theme="dark"]'),
    ).toBeHidden();

    const lightCardBox = await card.boundingBox();
    expect(lightCardBox).not.toBeNull();
    expect(lightCardBox!.height).toBeCloseTo(lightCardBox!.width / 4.2, 1);

    const lightTextBoxes = await texts.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }),
    );
    const lightChevronBox = await chevron.boundingBox();
    expect(lightChevronBox).not.toBeNull();

    const before = lightTextBoxes.map((box) => ({
      x: box.x - lightCardBox!.x,
      y: box.y - lightCardBox!.y,
      width: box.width,
      height: box.height,
    }));
    const chevronBefore = {
      x: lightChevronBox!.x - lightCardBox!.x,
      y: lightChevronBox!.y - lightCardBox!.y,
      width: lightChevronBox!.width,
      height: lightChevronBox!.height,
    };

    await setDashboardTheme(page, "dark");
    await expect(
      card.locator('[data-dashboard-live-feature-stage][data-theme="light"]'),
    ).toBeHidden();
    await expect(
      card.locator('[data-dashboard-live-feature-stage][data-theme="dark"]'),
    ).toBeVisible();

    const darkCardBox = await card.boundingBox();
    expect(darkCardBox).not.toBeNull();
    expect(darkCardBox!.width).toBeCloseTo(lightCardBox!.width, 2);
    expect(darkCardBox!.height).toBeCloseTo(lightCardBox!.height, 2);

    const darkTextBoxes = await texts.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }),
    );
    const darkChevronBox = await chevron.boundingBox();
    expect(darkChevronBox).not.toBeNull();

    const after = darkTextBoxes.map((box) => ({
      x: box.x - darkCardBox!.x,
      y: box.y - darkCardBox!.y,
      width: box.width,
      height: box.height,
    }));
    const chevronAfter = {
      x: darkChevronBox!.x - darkCardBox!.x,
      y: darkChevronBox!.y - darkCardBox!.y,
      width: darkChevronBox!.width,
      height: darkChevronBox!.height,
    };

    before.forEach((box, index) => {
      expect(after[index].x).toBeCloseTo(box.x, 2);
      // Chromium can shift font baselines by a sub-pixel across light/dark rendering.
      // Keep this bounded tightly enough to catch real layout movement.
      expect(Math.abs(after[index].y - box.y)).toBeLessThanOrEqual(0.5);
      expect(after[index].width).toBeCloseTo(box.width, 2);
      expect(after[index].height).toBeCloseTo(box.height, 2);
    });

    expect(chevronAfter.x).toBeCloseTo(chevronBefore.x, 2);
    expect(Math.abs(chevronAfter.y - chevronBefore.y)).toBeLessThanOrEqual(0.5);
    expect(chevronAfter.width).toBeCloseTo(chevronBefore.width, 2);
    expect(chevronAfter.height).toBeCloseTo(chevronBefore.height, 2);
  }
});


test("dashboard fixed-geometry surfaces stay stable at 412x915 and coach CTA remains tappable", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 412, height: 915 });
  await createDashboardSession(page, request);

  for (const theme of ["light", "dark"] as const) {
    await setDashboardTheme(page, theme);

    for (const kind of ["food", "progress"] as const) {
      const card = page.locator(`[data-dashboard-live-feature-card][data-kind="${kind}"]`);
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeCloseTo(box!.width / 4.2, 1);
      await expect(card.locator("[data-dashboard-live-feature-text]")).toHaveCSS("user-select", "none");
    }

    const coach = page.locator("[data-dashboard-coach-banner]");
    await expect(coach).toBeVisible();
    await expect(coach).toHaveAttribute("data-dashboard-fixed-geometry", "");
    await expect(coach.locator("[data-dashboard-decorative-text]")).toHaveCSS("user-select", "none");
    const title = coach.getByText("Diewish Her Zaman Yanında");
    const button = coach.getByRole("link", { name: /Hemen Sor/i });
    const titleBox = await title.boundingBox();
    const buttonBox = await button.boundingBox();
    expect(titleBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();
    expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(buttonBox!.x + 1);
  }

  const coachLink = page.locator("[data-dashboard-coach-banner]").getByRole("link", { name: /Hemen Sor/i });
  await coachLink.click();
  await expect(page).toHaveURL(/\/ai(?:$|\?)/);
});
