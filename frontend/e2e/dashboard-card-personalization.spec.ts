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

test("pointer reorder persists blood before food and normal card navigation remains active", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await createDashboardSession(page, request, { workScheduleType: "VARIABLE_SHIFT" });
  await openEditor(page);

  const bloodHandle = page.locator('[data-dashboard-card-drag-handle="blood"]');
  const foodRow = page.locator('[data-dashboard-card-editor-item="food"]');
  const bloodBox = await bloodHandle.boundingBox();
  const foodBox = await foodRow.boundingBox();
  expect(bloodBox).not.toBeNull();
  expect(foodBox).not.toBeNull();

  const saveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname.endsWith("/account/dashboard-cards"),
  );

  const editor = page.locator("[data-dashboard-card-editor]");
  const dropPoint = {
    x: foodBox!.x + foodBox!.width / 2,
    y: foodBox!.y + foodBox!.height * 0.2,
  };
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest<HTMLElement>("[data-dashboard-card-editor-item]")
          ?.dataset.dashboardCardEditorItem ?? null,
      dropPoint,
    ),
  ).toBe("food");

  await page.mouse.move(bloodBox!.x + bloodBox!.width / 2, bloodBox!.y + bloodBox!.height / 2);
  await page.mouse.down();
  await expect(editor).toHaveAttribute("data-dragging-card", "blood");

  await page.mouse.move(dropPoint.x, dropPoint.y);
  await expect(editor).toHaveAttribute(
    "data-draft-order",
    "blood,food,progress,coach",
    { timeout: 5_000 },
  );

  await page.mouse.up();
  await expect(editor).toHaveAttribute("data-dragging-card", "");
  const response = await saveResponse;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual({
    order: ["blood", "food", "progress", "coach"],
    hidden: [],
  });
  await waitForSaved(page);
  await expect.poll(() => slotIds(page)).toEqual(["blood", "food", "progress", "coach"]);

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-dashboard-card-editor]")).toBeHidden();
  await page.reload();
  await expect.poll(() => slotIds(page), { timeout: 15_000 }).toEqual([
    "blood",
    "food",
    "progress",
    "coach",
  ]);

  await page.locator('[data-dashboard-card-slot="food"] [data-dashboard-live-feature-link]').click();
  await expect(page).toHaveURL(/\/meals\/scan(?:$|\?)/);
});


test("touch-style pointer reorder is handle-scoped and persists on mobile", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await createDashboardSession(page, request, { workScheduleType: "VARIABLE_SHIFT" });
    await openEditor(page);

    const bloodHandle = page.locator('[data-dashboard-card-drag-handle="blood"]');
    const foodRow = page.locator('[data-dashboard-card-editor-item="food"]');
    const bloodBox = await bloodHandle.boundingBox();
    const foodBox = await foodRow.boundingBox();
    expect(bloodBox).not.toBeNull();
    expect(foodBox).not.toBeNull();

    expect(await bloodHandle.evaluate((node) => getComputedStyle(node).touchAction)).toBe("none");
    expect(
      await foodRow.evaluate((node) => getComputedStyle(node).touchAction),
    ).not.toBe("none");

    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname.endsWith("/account/dashboard-cards"),
    );

    const editor = page.locator("[data-dashboard-card-editor]");
    const dropPoint = {
      x: foodBox!.x + foodBox!.width / 2,
      y: foodBox!.y + foodBox!.height * 0.2,
    };
    expect(
      await page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest<HTMLElement>("[data-dashboard-card-editor-item]")
            ?.dataset.dashboardCardEditorItem ?? null,
        dropPoint,
      ),
    ).toBe("food");

    await bloodHandle.dispatchEvent("pointerdown", {
      pointerId: 41,
      pointerType: "touch",
      isPrimary: true,
      buttons: 1,
      clientX: bloodBox!.x + bloodBox!.width / 2,
      clientY: bloodBox!.y + bloodBox!.height / 2,
    });
    await expect(editor).toHaveAttribute("data-dragging-card", "blood");

    await page.evaluate(
      ({ x, y }) => {
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            cancelable: true,
            pointerId: 41,
            pointerType: "touch",
            isPrimary: true,
            buttons: 1,
            clientX: x,
            clientY: y,
          }),
        );
      },
      dropPoint,
    );
    await expect(editor).toHaveAttribute(
      "data-draft-order",
      "blood,food,progress,coach",
      { timeout: 5_000 },
    );

    await page.evaluate(() => {
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          pointerId: 41,
          pointerType: "touch",
          isPrimary: true,
          buttons: 0,
        }),
      );
    });
    await expect(editor).toHaveAttribute("data-dragging-card", "");
    const response = await saveResponse;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toEqual({
      order: ["blood", "food", "progress", "coach"],
      hidden: [],
    });
    await waitForSaved(page);
    await expect.poll(() => slotIds(page)).toEqual(["blood", "food", "progress", "coach"]);

    const editor = page.locator("[data-dashboard-card-editor]");
    const editorOverflow = await editor.evaluate((node) => getComputedStyle(node).overflowY);
    expect(["auto", "scroll"]).toContain(editorOverflow);

    await page.keyboard.press("Escape");
    await expect(editor).toBeHidden();
    await page.locator('[data-dashboard-card-slot="food"] [data-dashboard-live-feature-link]').tap();
    await expect(page).toHaveURL(/\/meals\/scan(?:$|\?)/);
  } finally {
    await context.close();
  }
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
