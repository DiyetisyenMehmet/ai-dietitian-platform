import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  createDashboardSession,
  loginDashboardSession,
  setDashboardTheme,
} from "./dashboard-test-session";

function cardSlots(page: Page) {
  return page.locator("[data-dashboard-card-slot]");
}

function quickSlots(page: Page) {
  return page.locator("[data-quick-action-slot]");
}

async function ids(locator: ReturnType<typeof cardSlots>): Promise<string[]> {
  return locator.evaluateAll((nodes) =>
    nodes.map((node) =>
      node.getAttribute("data-dashboard-card-slot") ??
      node.getAttribute("data-quick-action-slot") ??
      "",
    ),
  );
}

async function cardIds(page: Page) {
  return ids(cardSlots(page));
}

async function quickIds(page: Page) {
  return ids(quickSlots(page));
}

async function openEdit(page: Page) {
  const toggle = page.getByRole("button", { name: "Ana ekranı düzenle" });
  await expect(toggle).toBeEnabled({ timeout: 15_000 });
  await toggle.click();
  await expect(page.locator("[data-dashboard-personalization]")).toHaveAttribute(
    "data-editing",
    "true",
  );
}

async function closeEdit(page: Page) {
  await page.getByRole("button", { name: "Ana ekran düzenlemeyi kapat" }).click();
  await expect(page.locator("[data-dashboard-personalization]")).toHaveAttribute(
    "data-editing",
    "false",
  );
}

async function waitForSaved(page: Page) {
  await expect(page.locator("[data-dashboard-personalization]")).toHaveAttribute(
    "data-saving",
    "false",
    { timeout: 15_000 },
  );
}

async function preparePointerDrag(
  page: Page,
  sourceSelector: string,
  targetSelector: string,
) {
  const source = page.locator(sourceSelector);
  const target = page.locator(targetSelector);

  await target.scrollIntoViewIfNeeded();
  await source.scrollIntoViewIfNeeded();
  await expect(source).toBeVisible();

  await expect
    .poll(async () =>
      source.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const top = document.elementFromPoint(x, y);
        return (
          x >= 0 &&
          y >= 0 &&
          x <= window.innerWidth &&
          y <= window.innerHeight &&
          !!top &&
          (top === node || node.contains(top))
        );
      }),
    )
    .toBe(true);

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  return { source, target, sourceBox: sourceBox!, targetBox: targetBox! };
}

async function dragBefore(
  page: Page,
  sourceSelector: string,
  targetSelector: string,
  axis: "x" | "y",
) {
  const { sourceBox, targetBox } = await preparePointerDrag(
    page,
    sourceSelector,
    targetSelector,
  );

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    axis === "x" ? targetBox.x + targetBox.width * 0.2 : targetBox.x + targetBox.width / 2,
    axis === "y" ? targetBox.y + targetBox.height * 0.2 : targetBox.y + targetBox.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
}

async function newMobilePage(contextFactory: () => Promise<BrowserContext>) {
  const context = await contextFactory();
  return { context, page: await context.newPage() };
}

test("inline edit manages hide/show, minimums, reset, persistence and account isolation", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(220_000);
  const first = await createDashboardSession(page, request, { workScheduleType: "VARIABLE_SHIFT" });
  await expect(cardSlots(page)).toHaveCount(4);
  await expect(quickSlots(page)).toHaveCount(4);

  expect(await cardIds(page)).toEqual(["food", "blood", "progress", "coach"]);
  expect(await quickIds(page)).toEqual(["meal", "water", "activity", "weight"]);
  await expect(page.locator("[data-dashboard-card-drag-handle]")).toHaveCount(0);
  await expect(page.locator("[data-quick-action-drag-handle]")).toHaveCount(0);

  const heading = page.getByRole("heading", { name: "Bugün için hızlı işlemler" });
  const editToggle = page.getByRole("button", { name: "Ana ekranı düzenle" });
  const [headingBox, toggleBox] = await Promise.all([heading.boundingBox(), editToggle.boundingBox()]);
  expect(headingBox).not.toBeNull();
  expect(toggleBox).not.toBeNull();
  expect(toggleBox!.x).toBeGreaterThan(headingBox!.x);
  expect(toggleBox!.width).toBeGreaterThanOrEqual(40);
  expect(toggleBox!.height).toBeGreaterThanOrEqual(40);

  await openEdit(page);
  await expect(page.locator("[data-dashboard-card-drag-handle]")).toHaveCount(4);
  await expect(page.locator("[data-quick-action-drag-handle]")).toHaveCount(4);

  await page.getByRole("button", { name: "Kan Tahlili Analizi kartını gizle" }).click();
  await waitForSaved(page);
  expect(await cardIds(page)).toEqual(["food", "progress", "coach"]);

  await page.getByRole("button", { name: "Besin ve Barkod Tarayıcı kartını gizle" }).click();
  await expect(page.getByText("Ana ekranda en az 3 kart bulunmalı.")).toBeVisible();
  expect(await cardIds(page)).toEqual(["food", "progress", "coach"]);

  await page.getByRole("button", { name: "Kilo Ekle hızlı işlemini gizle" }).click();
  await waitForSaved(page);
  expect(await quickIds(page)).toEqual(["meal", "water", "activity"]);

  await page.getByRole("button", { name: "Öğün Ekle hızlı işlemini gizle" }).click();
  await expect(page.getByText("Ana ekranda en az 3 hızlı işlem bulunmalı.")).toBeVisible();
  expect(await quickIds(page)).toEqual(["meal", "water", "activity"]);

  const sameUserContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sameUserPage = await sameUserContext.newPage();
  try {
    await loginDashboardSession(sameUserPage, first.email, first.password);
    await expect.poll(() => cardIds(sameUserPage), { timeout: 15_000 }).toEqual([
      "food",
      "progress",
      "coach",
    ]);
    await expect.poll(() => quickIds(sameUserPage), { timeout: 15_000 }).toEqual([
      "meal",
      "water",
      "activity",
    ]);
  } finally {
    await sameUserContext.close();
  }

  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const secondPage = await secondContext.newPage();
  try {
    await createDashboardSession(secondPage, request, { workScheduleType: "VARIABLE_SHIFT" });
    await expect.poll(() => cardIds(secondPage), { timeout: 15_000 }).toEqual([
      "food",
      "blood",
      "progress",
      "coach",
    ]);
    await expect.poll(() => quickIds(secondPage), { timeout: 15_000 }).toEqual([
      "meal",
      "water",
      "activity",
      "weight",
    ]);
  } finally {
    await secondContext.close();
  }

  await page.getByRole("button", { name: "Gizlenenleri Gör" }).click();
  const sheet = page.locator("[data-hidden-items-sheet]");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-hidden-card="blood"]')).toBeVisible();
  await sheet.locator('[data-hidden-card="blood"]').getByRole("button", { name: "Göster" }).click();
  await waitForSaved(page);
  expect(await cardIds(page)).toEqual(["food", "blood", "progress", "coach"]);

  await sheet.getByRole("tab", { name: "Hızlı İşlemler" }).click();
  await expect(sheet.locator('[data-hidden-quick-action="weight"]')).toBeVisible();
  await sheet.locator('[data-hidden-quick-action="weight"]').getByRole("button", { name: "Göster" }).click();
  await waitForSaved(page);
  expect(await quickIds(page)).toEqual(["meal", "water", "activity", "weight"]);

  await sheet.getByRole("button", { name: "Varsayılana Dön" }).click();
  await expect(sheet.locator("[data-reset-confirmation]")).toBeVisible();
  await sheet.locator("[data-reset-confirmation]").getByRole("button", { name: "Varsayılana Dön" }).click();
  await waitForSaved(page);
  expect(await cardIds(page)).toEqual(["food", "blood", "progress", "coach"]);
  expect(await quickIds(page)).toEqual(["meal", "water", "activity", "weight"]);

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await closeEdit(page);
  await expect(page.locator("[data-dashboard-card-drag-handle]")).toHaveCount(0);
  await expect(page.locator("[data-quick-action-drag-handle]")).toHaveCount(0);
});

test("mouse drag persists cards and quick actions, then normal navigation returns", async ({
  page,
  request,
}) => {
  test.setTimeout(160_000);
  await createDashboardSession(page, request, { workScheduleType: "VARIABLE_SHIFT" });
  await openEdit(page);

  let responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname.endsWith("/account/dashboard-cards"),
  );
  await dragBefore(
    page,
    '[data-dashboard-card-slot="blood"]',
    '[data-dashboard-card-slot="food"]',
    "y",
  );
  let response = await responsePromise;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON().order).toEqual(["blood", "food", "progress", "coach"]);
  await waitForSaved(page);
  expect(await cardIds(page)).toEqual(["blood", "food", "progress", "coach"]);

  responsePromise = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "PUT" &&
      new URL(candidate.url()).pathname.endsWith("/account/dashboard-cards"),
  );
  await dragBefore(
    page,
    '[data-quick-action-slot="weight"]',
    '[data-quick-action-slot="meal"]',
    "x",
  );
  response = await responsePromise;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON().quickActionOrder).toEqual([
    "weight",
    "meal",
    "water",
    "activity",
  ]);
  await waitForSaved(page);
  expect(await quickIds(page)).toEqual(["weight", "meal", "water", "activity"]);

  await closeEdit(page);
  await page.reload();
  await expect.poll(() => cardIds(page), { timeout: 15_000 }).toEqual([
    "blood",
    "food",
    "progress",
    "coach",
  ]);
  await expect.poll(() => quickIds(page), { timeout: 15_000 }).toEqual([
    "weight",
    "meal",
    "water",
    "activity",
  ]);

  await page.locator('[data-dashboard-card-slot="food"] [data-dashboard-live-feature-link]').click();
  await expect(page).toHaveURL(/\/meals\/scan(?:$|\?)/);
});

test("touch drag is surface-wide and keyboard reorder stays accessible", async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const { context, page } = await newMobilePage(() =>
    browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    }),
  );

  try {
    await createDashboardSession(page, request, { workScheduleType: "VARIABLE_SHIFT" });
    await openEdit(page);

    const {
      source: cardSource,
      target: cardTarget,
      sourceBox: cardSourceBox,
      targetBox: cardTargetBox,
    } = await preparePointerDrag(
      page,
      '[data-dashboard-card-slot="blood"]',
      '[data-dashboard-card-slot="food"]',
    );
    expect(await cardSource.evaluate((node) => getComputedStyle(node).touchAction)).toBe("none");
    expect(
      await cardTarget.evaluate((node) => getComputedStyle(node).touchAction),
    ).toBe("none");

    const cdp = await context.newCDPSession(page);
    let saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname.endsWith("/account/dashboard-cards"),
      { timeout: 15_000 },
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{
        x: cardSourceBox!.x + cardSourceBox!.width / 2,
        y: cardSourceBox!.y + cardSourceBox!.height / 2,
        id: 1,
        radiusX: 1,
        radiusY: 1,
        force: 1,
      }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: cardTargetBox!.x + cardTargetBox!.width / 2,
        y: cardTargetBox!.y + cardTargetBox!.height * 0.2,
        id: 1,
        radiusX: 1,
        radiusY: 1,
        force: 1,
      }],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect((await saveResponse).ok()).toBe(true);
    await waitForSaved(page);
    expect(await cardIds(page)).toEqual(["blood", "food", "progress", "coach"]);

    const {
      source: quickSource,
      target: quickTarget,
      sourceBox: quickSourceBox,
      targetBox: quickTargetBox,
    } = await preparePointerDrag(
      page,
      '[data-quick-action-slot="weight"]',
      '[data-quick-action-slot="meal"]',
    );
    expect(await quickSource.evaluate((node) => getComputedStyle(node).touchAction)).toBe("none");
    expect(
      await quickTarget.evaluate((node) => getComputedStyle(node).touchAction),
    ).toBe("none");

    saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname.endsWith("/account/dashboard-cards"),
      { timeout: 15_000 },
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{
        x: quickSourceBox!.x + quickSourceBox!.width / 2,
        y: quickSourceBox!.y + quickSourceBox!.height / 2,
        id: 2,
        radiusX: 1,
        radiusY: 1,
        force: 1,
      }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: quickTargetBox!.x + quickTargetBox!.width * 0.2,
        y: quickTargetBox!.y + quickTargetBox!.height / 2,
        id: 2,
        radiusX: 1,
        radiusY: 1,
        force: 1,
      }],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect((await saveResponse).ok()).toBe(true);
    await waitForSaved(page);
    expect(await quickIds(page)).toEqual(["weight", "meal", "water", "activity"]);

    const beforeScroll = {
      cards: await cardIds(page),
      actions: await quickIds(page),
    };
    await page.evaluate(() => window.scrollBy({ top: 240, behavior: "instant" }));
    expect(await cardIds(page)).toEqual(beforeScroll.cards);
    expect(await quickIds(page)).toEqual(beforeScroll.actions);

    const coachHandle = page.locator('[data-dashboard-card-drag-handle="coach"]');
    await coachHandle.focus();
    await coachHandle.press("ArrowUp");
    await waitForSaved(page);
    expect(await cardIds(page)).toEqual(["blood", "food", "coach", "progress"]);

    const activityHandle = page.locator('[data-quick-action-drag-handle="activity"]');
    await activityHandle.focus();
    await activityHandle.press("ArrowLeft");
    await waitForSaved(page);
    expect(await quickIds(page)).toEqual(["weight", "meal", "activity", "water"]);
  } finally {
    await context.close();
  }
});

test("inline editor and hidden sheet stay responsive in light and dark modes", async ({
  page,
  request,
}) => {
  test.setTimeout(220_000);
  await createDashboardSession(page, request, { workScheduleType: "VARIABLE_SHIFT" });

  for (const theme of ["light", "dark"] as const) {
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
      await page.evaluate(() => window.scrollTo(0, 0));

      const rootGeometry = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(rootGeometry.scrollWidth).toBeLessThanOrEqual(rootGeometry.clientWidth + 1);

      const fixed = await page.locator("[data-dashboard-fixed-geometry]").evaluateAll((nodes) =>
        nodes.map((node) => {
          const element = node as HTMLElement;
          const box = element.getBoundingClientRect();
          return {
            width: box.width,
            height: box.height,
            frame: element.getAttribute("data-frame-aspect"),
            coach: element.hasAttribute("data-dashboard-coach-banner"),
          };
        }),
      );
      expect(fixed.length).toBeGreaterThanOrEqual(4);
      for (const card of fixed) {
        if (card.coach) {
          expect(card.height).toBeCloseTo(card.width / (670 / 126), 1);
        } else if (card.frame === "21:5") {
          expect(card.height).toBeCloseTo(card.width / 4.2, 1);
        }
      }

      await openEdit(page);
      const editOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(editOverflow.scrollWidth).toBeLessThanOrEqual(editOverflow.clientWidth + 1);

      await page.getByRole("button", { name: "Gizlenenleri Gör" }).click();
      const sheet = page.locator("[data-hidden-items-sheet]");
      await expect(sheet).toBeVisible();
      const sheetGeometry = await sheet.evaluate((node) => {
        const element = node as HTMLElement;
        const box = element.getBoundingClientRect();
        return {
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          height: box.height,
          viewportHeight: window.innerHeight,
        };
      });
      expect(sheetGeometry.scrollWidth).toBeLessThanOrEqual(sheetGeometry.clientWidth + 1);
      expect(sheetGeometry.height).toBeLessThanOrEqual(sheetGeometry.viewportHeight + 1);
      await sheet.getByRole("tab", { name: "Hızlı İşlemler" }).click();
      await sheet.getByRole("tab", { name: "Kartlar" }).click();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await closeEdit(page);
    }
  }
});
