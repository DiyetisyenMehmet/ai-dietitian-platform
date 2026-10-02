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


test("dashboard fixed-geometry surfaces stay stable across mobile viewports and coach CTA remains tappable", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await createDashboardSession(page, request);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ] as const) {
    await page.setViewportSize(viewport);

    for (const theme of ["light", "dark"] as const) {
      await setDashboardTheme(page, theme);

      for (const kind of ["food", "progress"] as const) {
        const card = page.locator(`[data-dashboard-live-feature-card][data-kind="${kind}"]`);
        const box = await card.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeCloseTo(box!.width / 4.2, 1);
        const textInteraction = await card
          .locator("[data-dashboard-live-feature-text]")
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              userSelect: getComputedStyle(node).userSelect,
              pointerEvents: getComputedStyle(node).pointerEvents,
              textSizeAdjust:
                getComputedStyle(node).getPropertyValue("-webkit-text-size-adjust")
                || getComputedStyle(node).getPropertyValue("text-size-adjust"),
            })),
          );
        expect(textInteraction).toHaveLength(3);
        for (const item of textInteraction) {
          expect(item.userSelect).toBe("none");
          expect(item.pointerEvents).toBe("none");
          expect(item.textSizeAdjust.trim()).toBe("100%");
        }
      }

      const coach = page.locator("[data-dashboard-coach-banner]");
      const decorativeText = coach.locator("[data-dashboard-decorative-text]");
      const title = coach.getByText("Diewish Her Zaman Yanında");
      const subtitle = coach.getByText("Daha sağlıklı bir sen için buradayım.");
      const button = coach.getByRole("link", { name: /Hemen Sor/i });

      await expect(coach).toBeVisible();
      await expect(coach).toHaveAttribute("data-dashboard-fixed-geometry", "");
      await expect(coach).toHaveCSS("container-type", "inline-size");
      await expect(title).toBeVisible();
      await expect(subtitle).toBeVisible();
      await expect(button).toBeVisible();

      const decorativeInteraction = await decorativeText.evaluate((node) => ({
        userSelect: getComputedStyle(node).userSelect,
        pointerEvents: getComputedStyle(node).pointerEvents,
        textSizeAdjust:
          getComputedStyle(node).getPropertyValue("-webkit-text-size-adjust")
          || getComputedStyle(node).getPropertyValue("text-size-adjust"),
      }));
      expect(decorativeInteraction.userSelect).toBe("none");
      expect(decorativeInteraction.pointerEvents).toBe("none");
      expect(decorativeInteraction.textSizeAdjust.trim()).toBe("100%");

      const coachBox = await coach.boundingBox();
      const titleBox = await title.boundingBox();
      const subtitleBox = await subtitle.boundingBox();
      const buttonBox = await button.boundingBox();
      expect(coachBox).not.toBeNull();
      expect(titleBox).not.toBeNull();
      expect(subtitleBox).not.toBeNull();
      expect(buttonBox).not.toBeNull();

      const titleRight = titleBox!.x + titleBox!.width;
      const subtitleRight = subtitleBox!.x + subtitleBox!.width;
      const buttonRight = buttonBox!.x + buttonBox!.width;
      const coachRight = coachBox!.x + coachBox!.width;

      console.info(
        "[coach-geometry]",
        JSON.stringify({
          viewport,
          theme,
          coach: { width: coachBox!.width },
          title: { x: titleBox!.x, right: titleRight },
          subtitle: { right: subtitleRight },
          button: {
            x: buttonBox!.x,
            right: buttonRight,
            width: buttonBox!.width,
            height: buttonBox!.height,
          },
          titleGap: buttonBox!.x - titleRight,
        }),
      );

      expect(titleRight).toBeLessThanOrEqual(buttonBox!.x + 1);
      expect(buttonBox!.x - titleRight).toBeGreaterThanOrEqual(4);
      expect(subtitleRight).toBeLessThanOrEqual(buttonBox!.x + 1);
      expect(titleBox!.x).toBeGreaterThanOrEqual(coachBox!.x - 1);
      expect(subtitleBox!.x).toBeGreaterThanOrEqual(coachBox!.x - 1);
      expect(buttonRight).toBeLessThanOrEqual(coachRight + 1);
      expect(buttonBox!.width).toBeGreaterThanOrEqual(80);
      expect(buttonBox!.height).toBeGreaterThanOrEqual(32);
    }
  }

  await page.setViewportSize({ width: 412, height: 915 });
  await setDashboardTheme(page, "light");
  const coachLink = page
    .locator("[data-dashboard-coach-banner]")
    .getByRole("link", { name: /Hemen Sor/i });
  await coachLink.click();
  await expect(page).toHaveURL(/\/ai(?:$|\?)/);
});
