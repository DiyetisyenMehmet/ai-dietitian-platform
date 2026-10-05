import { expect, test, type Page } from "@playwright/test";
import {
  createDashboardSession,
  setDashboardTheme,
} from "./dashboard-test-session";

function slots(page: Page) {
  return page.locator("[data-dashboard-card-slot]");
}

async function slotIds(page: Page): Promise<string[]> {
  return slots(page).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-dashboard-card-slot") || ""),
  );
}

async function openEditor(page: Page) {
  await page.getByRole("button", { name: "Ana ekran kartlarını düzenle" }).click();
  await expect(page.locator("[data-dashboard-card-editor]")).toBeVisible();
}

async function waitForSaved(page: Page) {
  await expect(page.locator("[data-dashboard-card-editor]")).toHaveAttribute(
    "data-saving",
    "false",
    { timeout: 10_000 },
  );
}

test("Dashboard card personalization persists order, hide/show, minimum three and reset", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180_000);
  await createDashboardSession(page, request, { workScheduleType: "VARIABLE_SHIFT" });
  await expect(slots(page)).toHaveCount(4);
  expect(await slotIds(page)).toEqual(["food", "blood", "progress", "coach"]);

  await openEditor(page);
  await page.getByRole("button", { name: "Besin ve Barkod Tarayıcı kartını aşağı taşı" }).click();
  await waitForSaved(page);
  await expect.poll(() => slotIds(page)).toEqual(["blood", "food", "progress", "coach"]);

  await page.getByRole("button", { name: "Kan Tahlili Analizi kartını gizle" }).click();
  await waitForSaved(page);
  await expect.poll(() => slotIds(page)).toEqual(["food", "progress", "coach"]);

  await page.getByRole("button", { name: "Besin ve Barkod Tarayıcı kartını gizle" }).click();
  await expect(page.getByText("Ana ekranda en az 3 kart bulunmalı.")).toBeVisible();
  expect(await slotIds(page)).toEqual(["food", "progress", "coach"]);

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-dashboard-card-editor]")).toBeHidden();
  await page.reload();
  await expect.poll(() => slotIds(page), { timeout: 15_000 }).toEqual([
    "food",
    "progress",
    "coach",
  ]);

  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const secondPage = await secondContext.newPage();
  try {
    await createDashboardSession(secondPage, request, { workScheduleType: "VARIABLE_SHIFT" });
    await expect.poll(() => slotIds(secondPage), { timeout: 15_000 }).toEqual([
      "food",
      "blood",
      "progress",
      "coach",
    ]);
  } finally {
    await secondContext.close();
  }

  await openEditor(page);
  await page.getByRole("button", { name: "Göster" }).click();
  await waitForSaved(page);
  await expect.poll(() => slotIds(page)).toEqual(["blood", "food", "progress", "coach"]);

  await page.getByRole("button", { name: "Varsayılana Dön" }).click();
  await expect(page.getByRole("heading", { name: "Varsayılan düzene dön?" })).toBeVisible();
  await page.getByRole("button", { name: "Varsayılana Dön", exact: true }).last().click();
  await expect.poll(() => slotIds(page)).toEqual(["food", "blood", "progress", "coach"]);

  await page.keyboard.press("Escape");
  await page.reload();
  await expect.poll(() => slotIds(page), { timeout: 15_000 }).toEqual([
    "food",
    "blood",
    "progress",
    "coach",
  ]);
});

test("pointer reorder works and normal card navigation remains active after editing", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await createDashboardSession(page, request, { workScheduleType: "VARIABLE_SHIFT" });
  await openEditor(page);

  const foodHandle = page.locator('[data-dashboard-card-drag-handle="food"]');
  const bloodRow = page.locator('[data-dashboard-card-editor-item="blood"]');
  const foodBox = await foodHandle.boundingBox();
  const bloodBox = await bloodRow.boundingBox();
  expect(foodBox).not.toBeNull();
  expect(bloodBox).not.toBeNull();

  await page.mouse.move(foodBox!.x + foodBox!.width / 2, foodBox!.y + foodBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    bloodBox!.x + bloodBox!.width / 2,
    bloodBox!.y + bloodBox!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await waitForSaved(page);
  await expect.poll(() => slotIds(page)).toEqual(["blood", "food", "progress", "coach"]);

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-dashboard-card-editor]")).toBeHidden();
  await page.locator('[data-dashboard-card-slot="food"] [data-dashboard-live-feature-link]').click();
  await expect(page).toHaveURL(/\/meals\/scan(?:$|\?)/);
});

test("personalized card layer stays responsive and keeps approved card geometry", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await createDashboardSession(page, request, { workScheduleType: "VARIABLE_SHIFT" });

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await setDashboardTheme(page, theme);

    for (const viewport of [
      { width: 320, height: 700 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 412, height: 915 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(slots(page)).toHaveCount(4);

      const geometry = await page.evaluate(() => {
        const root = document.documentElement;
        const fixed = [...document.querySelectorAll<HTMLElement>("[data-dashboard-fixed-geometry]")];
        return {
          overflow: root.scrollWidth - root.clientWidth,
          fixed: fixed.map((node) => {
            const box = node.getBoundingClientRect();
            return {
              width: box.width,
              height: box.height,
              frame: node.getAttribute("data-frame-aspect"),
              coach: node.hasAttribute("data-dashboard-coach-banner"),
            };
          }),
        };
      });

      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.fixed.length).toBeGreaterThanOrEqual(4);
      for (const card of geometry.fixed) {
        if (card.coach) {
          expect(card.height).toBeCloseTo(card.width / (670 / 126), 1);
        } else if (card.frame === "21:5") {
          expect(card.height).toBeCloseTo(card.width / 4.2, 1);
        }
      }

      await openEditor(page);
      const editorOverflow = await page.locator("[data-dashboard-card-editor]").evaluate((node) => {
        const el = node as HTMLElement;
        return {
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        };
      });
      expect(editorOverflow.scrollWidth).toBeLessThanOrEqual(editorOverflow.clientWidth + 1);
      await page.keyboard.press("Escape");
    }
  }
});
