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
      firstCardTop:
        document.querySelector("[data-dashboard-card-slot]")?.getBoundingClientRect().top ??
        Number.POSITIVE_INFINITY,
      viewportHeight: innerHeight,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.cardHeight).toBeLessThanOrEqual(310);
    if (width >= 390) expect(geometry.cardHeight).toBeLessThanOrEqual(220);
    expect(geometry.progressWidth).toBeLessThan(geometry.progressAreaWidth - 40);
    expect(geometry.toggleLeft).toBeGreaterThanOrEqual(geometry.progressRight);
    expect(geometry.titleFont).toBe("16px");
    expect(geometry.hintFont).toBe("12px");
    expect(geometry.metricsGap).toBe(10);
    expect(geometry.actionsGap).toBe(10);
    expect(geometry.editButton.width).toBeGreaterThanOrEqual(40);
    expect(geometry.editButton.height).toBeGreaterThanOrEqual(40);
    if (width < 640) {
      expect(geometry.headerHeight).toBeLessThanOrEqual(88);
      expect(geometry.metricsHeight).toBeLessThanOrEqual(122);
      expect(geometry.quickHeadingFont).toBe("19px");
    }
    if (width >= 390 && width <= 430) {
      expect(geometry.firstCardTop).toBeLessThan(geometry.viewportHeight);
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
