import { expect, test } from "@playwright/test";
import { createDashboardSession, setDashboardTheme } from "./dashboard-test-session";

test("Journey stays compact by default and expands/collapses with keyboard controls", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  await createDashboardSession(page, request, { workScheduleType: "VARIABLE_SHIFT" });

  const section = page.locator("[data-daily-journey-section]");
  await expect(section).toHaveAttribute("data-journey-status", "actionable", {
    timeout: 20_000,
  });
  await expect(section.locator("[data-journey-row]")).toHaveCount(1);
  await expect(
    section.getByRole("heading", { name: "Bugünkü Yolculuğum", exact: true }),
  ).toBeVisible();
  await expect(section.getByText("Tümünü göster", { exact: true })).toHaveCount(0);

  const toggle = section.locator("[data-journey-details-toggle]");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAccessibleName("Yolculuk detaylarını aç");
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
      progressWidth: document
        .querySelector("[data-journey-progress-area] [role=progressbar]")!
        .getBoundingClientRect().width,
      progressAreaWidth: document
        .querySelector("[data-journey-progress-area]")!
        .getBoundingClientRect().width,
      progressRight: document
        .querySelector("[data-journey-progress-area] [role=progressbar]")!
        .getBoundingClientRect().right,
      toggleLeft: document.querySelector("[data-journey-details-toggle]")!.getBoundingClientRect()
        .left,
      titleFont: getComputedStyle(document.querySelector("[data-daily-journey-section] h3")!)
        .fontSize,
      hintFont: getComputedStyle(document.querySelector("[data-journey-row] p")!).fontSize,
      metricsGap:
        document
          .querySelector("[data-daily-journey-section]")!
          .nextElementSibling!.getBoundingClientRect().top -
        document.querySelector("[data-daily-journey-section]")!.getBoundingClientRect().bottom,
      actionsGap: parseFloat(
        getComputedStyle(document.querySelector("[data-dashboard-personalization]")!).marginTop,
      ),
      headerHeight:
        document.querySelector("[data-dashboard-home-header]")?.getBoundingClientRect().height ?? 0,
      metricsHeight:
        document.querySelector("[data-dashboard-metrics]")?.getBoundingClientRect().height ?? 0,
      quickHeadingFont: getComputedStyle(
        document.querySelector("#dashboard-quick-actions-heading")!,
      ).fontSize,
      editButton: (() => {
        const box = document.querySelector("[data-dashboard-edit-toggle]")!.getBoundingClientRect();
        return { width: box.width, height: box.height };
      })(),
      firstCard: (() => {
        const box = document.querySelector("[data-dashboard-card-slot]")?.getBoundingClientRect();
        if (!box) return { top: Number.POSITIVE_INFINITY, visible: 0 };
        return {
          top: box.top,
          visible: Math.max(0, Math.min(innerHeight, box.bottom) - Math.max(0, box.top)),
        };
      })(),
      viewportHeight: innerHeight,
      greeting: (() => {
        const element = document.querySelector("[data-dashboard-greeting]") as HTMLElement;
        const box = element.getBoundingClientRect();
        return {
          height: box.height,
          width: box.width,
          scrollWidth: element.scrollWidth,
          whiteSpace: getComputedStyle(element).whiteSpace,
          fontSize: getComputedStyle(element).fontSize,
          lineHeight: getComputedStyle(element).lineHeight,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
        };
      })(),
      greetingEmoji: (() => {
        const box = document.querySelector("[data-dashboard-greeting-emoji]")!.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, height: box.height };
      })(),
      headerInfo: (() => {
        const element = document.querySelector("[data-dashboard-header-info]") as HTMLElement;
        const box = element.getBoundingClientRect();
        return {
          height: box.height,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          whiteSpace: getComputedStyle(element).whiteSpace,
        };
      })(),
      headerActionsLeft:
        document.querySelector("[data-dashboard-header-actions]")?.getBoundingClientRect().left ??
        Number.POSITIVE_INFINITY,
      topProfileCount: document.querySelectorAll('a[aria-label="Profilini aç"]').length,
      headerActionCount: document.querySelector("[data-dashboard-header-actions]")?.children.length ?? 0,
      headerActionSizes: Array.from(
        document.querySelector("[data-dashboard-header-actions]")?.children ?? [],
      ).map((element) => {
        const box = (element as HTMLElement).getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
      metricRingWidths: Array.from(
        document.querySelectorAll("[data-dashboard-metrics] > div > div > div:first-child"),
      ).map((element) => (element as HTMLElement).getBoundingClientRect().width),
      metricLabelTops: Array.from(
        document.querySelectorAll("[data-dashboard-metrics] > div > div > p"),
      ).map((element) => (element as HTMLElement).getBoundingClientRect().top),
      quickTileSizes: Array.from(
        document.querySelectorAll("[data-quick-action-slot] > a, [data-quick-action-slot] > button"),
      ).map((element) => {
        const box = (element as HTMLElement).getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.cardHeight).toBeLessThanOrEqual(285);
    if (width >= 390) expect(geometry.cardHeight).toBeLessThanOrEqual(190);
    expect(geometry.progressWidth).toBeLessThan(geometry.progressAreaWidth - 40);
    expect(geometry.toggleLeft).toBeGreaterThanOrEqual(geometry.progressRight);
    expect(geometry.titleFont).toBe(width < 640 ? "15px" : "16px");
    expect(geometry.hintFont).toBe("12px");
    expect(geometry.metricsGap).toBeCloseTo(6, 3);
    expect(geometry.actionsGap).toBeCloseTo(6, 3);
    expect(geometry.editButton.width).toBeGreaterThanOrEqual(36);
    expect(geometry.editButton.height).toBeGreaterThanOrEqual(36);
    expect(geometry.topProfileCount).toBe(0);
    expect(geometry.headerActionCount).toBe(2);
    expect(geometry.greeting.whiteSpace).toBe("nowrap");
    expect(geometry.greeting.right).toBeLessThanOrEqual(geometry.headerActionsLeft - 5);
    expect(geometry.greetingEmoji.top).toBeGreaterThanOrEqual(geometry.greeting.top - 0.5);
    expect(geometry.greetingEmoji.bottom).toBeLessThanOrEqual(geometry.greeting.bottom + 0.5);
    expect(geometry.headerInfo.whiteSpace).toBe("nowrap");
    expect(geometry.headerInfo.scrollWidth).toBeLessThanOrEqual(geometry.headerInfo.clientWidth + 1);
    for (const size of geometry.headerActionSizes) {
      expect(size.width).toBeGreaterThanOrEqual(36);
      expect(size.height).toBeGreaterThanOrEqual(36);
    }
    expect(Math.max(...geometry.metricRingWidths) - Math.min(...geometry.metricRingWidths)).toBeLessThanOrEqual(0.5);
    expect(Math.max(...geometry.metricLabelTops) - Math.min(...geometry.metricLabelTops)).toBeLessThanOrEqual(0.5);
    expect(geometry.quickTileSizes).toHaveLength(4);
    expect(Math.max(...geometry.quickTileSizes.map((item) => item.height)) - Math.min(...geometry.quickTileSizes.map((item) => item.height))).toBeLessThanOrEqual(0.5);
    if (width < 640) {
      expect(geometry.headerHeight).toBeLessThanOrEqual(88);
      expect(geometry.metricsHeight).toBeLessThanOrEqual(98);
      expect(geometry.quickHeadingFont).toBe("16px");
      expect(geometry.greeting.height).toBeLessThanOrEqual(28);
      expect(Math.max(...geometry.quickTileSizes.map((item) => item.height))).toBeLessThanOrEqual(73);
    }
    if (width === 390) expect(geometry.firstCard.visible).toBeGreaterThanOrEqual(72);
    if (width === 412) expect(geometry.firstCard.visible).toBeGreaterThanOrEqual(96);
    if (width === 430) expect(geometry.firstCard.visible).toBeGreaterThanOrEqual(110);
  }

  for (const [width, height] of [
    [390, 844],
    [412, 915],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    for (const theme of ["dark", "light"] as const) {
      await setDashboardTheme(page, theme);
      const themeGeometry = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        greetingWhiteSpace: getComputedStyle(
          document.querySelector("[data-dashboard-greeting]")!,
        ).whiteSpace,
        profileCount: document.querySelectorAll('a[aria-label="Profilini aç"]').length,
        firstCardVisible: (() => {
          const box = document.querySelector("[data-dashboard-card-slot]")?.getBoundingClientRect();
          if (!box) return 0;
          return Math.max(0, Math.min(innerHeight, box.bottom) - Math.max(0, box.top));
        })(),
        greetingEmojiContained: (() => {
          const greeting = document.querySelector("[data-dashboard-greeting]")!.getBoundingClientRect();
          const emoji = document.querySelector("[data-dashboard-greeting-emoji]")!.getBoundingClientRect();
          return emoji.top >= greeting.top - 0.5 && emoji.bottom <= greeting.bottom + 0.5;
        })(),
      }));
      expect(themeGeometry.scrollWidth).toBeLessThanOrEqual(themeGeometry.clientWidth + 1);
      expect(themeGeometry.greetingWhiteSpace).toBe("nowrap");
      expect(themeGeometry.greetingEmojiContained).toBe(true);
      expect(themeGeometry.profileCount).toBe(0);
      const minimumVisible = width === 390 ? 72 : width === 412 ? 96 : 110;
      expect(themeGeometry.firstCardVisible).toBeGreaterThanOrEqual(minimumVisible);
      await page.screenshot({
        path: testInfo.outputPath(`dashboard-compact-${width}x${height}-${theme}.png`),
        fullPage: false,
      });
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await setDashboardTheme(page, "dark");
  await expect(section.locator("[data-journey-row]")).toHaveCount(1);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await section.screenshot({ path: testInfo.outputPath("journey-compact-dark.png") });
  await setDashboardTheme(page, "light");
  await section.screenshot({ path: testInfo.outputPath("journey-compact-light.png") });
  await page.getByRole("button", { name: "Ana ekranı düzenle" }).click();
  await expect(
    page.getByText("Kartları basılı tutup sıralayabilirsin.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ana ekran düzenlemeyi kapat" }).click();
});
