import { expect, test, type Page } from "@playwright/test";
import { createDashboardSession } from "./dashboard-test-session";

const api = process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api";
const originalCards = ["food", "blood", "progress", "coach"];
const originalActions = ["meal", "water", "activity", "weight"];
const cardIds = (page: Page) =>
  page
    .locator("[data-dashboard-card-slot]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-dashboard-card-slot")));
const actionIds = (page: Page) =>
  page
    .locator("[data-quick-action-slot]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-quick-action-slot")));
const editor = (page: Page) => page.locator("[data-dashboard-personalization]");
async function open(page: Page) {
  const toggle = page.getByRole("button", { name: "Ana ekranı düzenle" });
  await expect(toggle).toBeEnabled({ timeout: 60_000 });
  await toggle.click();
  await expect(editor(page)).toHaveAttribute("data-editing", "true");
}
async function save(page: Page) {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "PUT" &&
      new URL(candidate.url()).pathname.endsWith("/account/dashboard-cards"),
  );
  await page.locator("[data-save-dashboard-layout]").click();
  expect((await response).ok()).toBe(true);
  await expect(editor(page)).toHaveAttribute("data-editing", "false");
}
async function drag(page: Page, sourceSelector: string, targetSelector: string, axis: "x" | "y") {
  const source = page.locator(sourceSelector);
  await source.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(250);
  const from = (await source.boundingBox())!;
  const to = (await page.locator(targetSelector).boundingBox())!;
  const x = from.x + from.width / 2,
    y = from.y + from.height / 2;
  expect(
    await page.evaluate(
      ({ x, y, selector }) => !!document.elementFromPoint(x, y)?.closest(selector),
      { x, y, selector: sourceSelector },
    ),
  ).toBe(true);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(
    axis === "x" ? to.x + to.width * 0.2 : x,
    axis === "y" ? to.y + to.height * 0.2 : y,
    { steps: 12 },
  );
  await page.mouse.up();
}
async function reorderAndHide(page: Page) {
  await drag(page, '[data-dashboard-card-slot="blood"]', '[data-dashboard-card-slot="food"]', "y");
  await expect.poll(() => cardIds(page)).toEqual(["blood", "food", "progress", "coach"]);
  await drag(page, '[data-quick-action-slot="weight"]', '[data-quick-action-slot="meal"]', "x");
  await expect.poll(() => actionIds(page)).toEqual(["weight", "meal", "water", "activity"]);
  await page.getByRole("button", { name: "İlerlememi Gör kartını gizle" }).click();
  await page.getByRole("button", { name: "Hareket hızlı işlemini gizle" }).click();
}
async function restore(page: Page) {
  await page.getByRole("button", { name: "Gizlenenleri Gör" }).click();
  const sheet = page.locator("[data-hidden-items-sheet]");
  // The panel remembers its last tab when reopened during the same edit session.
  await sheet.getByRole("tab", { name: "Kartlar", exact: true }).click();
  await sheet
    .locator('[data-hidden-card="progress"]')
    .getByRole("button", { name: "Göster" })
    .click();
  await sheet.getByRole("tab", { name: "Hızlı İşlemler" }).click();
  await sheet
    .locator('[data-hidden-quick-action="activity"]')
    .getByRole("button", { name: "Göster" })
    .click();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
}

test("Dashboard deployed runtime: explicit save, discard, reorder, hide/show, refresh and navigation", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const account = await createDashboardSession(page, request, {
    workScheduleType: "VARIABLE_SHIFT",
  });
  await expect(page.getByRole("button", { name: "Ana ekranı düzenle" })).toBeEnabled({
    timeout: 60_000,
  });
  await expect.poll(() => cardIds(page), { timeout: 20_000 }).toEqual(originalCards);
  let writes = 0;
  page.on("request", (req) => {
    if (req.method() === "PUT" && new URL(req.url()).pathname.endsWith("/account/dashboard-cards"))
      writes++;
  });
  const readSaved = async () => {
    const response = await request.get(`${api}/account/dashboard-cards`, {
      headers: { authorization: `Bearer ${account.token}` },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).data.preferences;
  };
  const food = page.locator('[data-dashboard-card-slot="food"]');
  const baselinePreferences = await readSaved();
  const arrow = food.locator("[data-dashboard-feature-chevron]");
  await open(page);
  await expect(arrow.locator("svg")).toBeHidden();
  const arrowBox = (await arrow.boundingBox())!;
  const eyeBox = (await food.locator("[data-dashboard-card-hide]").boundingBox())!;
  expect(eyeBox.x).toBeCloseTo(arrowBox.x, 0);
  expect(eyeBox.y).toBeCloseTo(arrowBox.y, 0);
  expect(await food.evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  await page.setViewportSize({ width: 390, height: 1500 });
  await editor(page).screenshot({ path: testInfo.outputPath("dashboard-edit-runtime.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await reorderAndHide(page);
  expect(writes).toBe(0);
  const unchanged = await readSaved();
  expect(unchanged).toEqual(baselinePreferences);
  await page.getByRole("button", { name: "Ana ekran düzenlemeyi kapat" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Değişiklikleri kaydetmeden çıkmak istiyor musun?",
  );
  await page.getByRole("button", { name: "Düzenlemeye devam et" }).click();
  await expect(editor(page)).toHaveAttribute("data-editing", "true");
  await page.getByRole("button", { name: "Ana ekran düzenlemeyi kapat" }).click();
  await page.getByRole("button", { name: "Kaydetmeden çık" }).click();
  await expect.poll(() => cardIds(page)).toEqual(originalCards);
  expect(writes).toBe(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Ana ekranı düzenle" })).toBeEnabled({
    timeout: 60_000,
  });
  await expect.poll(() => actionIds(page), { timeout: 20_000 }).toEqual(originalActions);
  await open(page);
  await reorderAndHide(page);
  await save(page);
  expect(writes).toBe(1);
  await expect(arrow.locator("svg")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Ana ekranı düzenle" })).toBeEnabled({
    timeout: 60_000,
  });
  await expect.poll(() => cardIds(page), { timeout: 20_000 }).toEqual(["blood", "food", "coach"]);
  await expect
    .poll(() => actionIds(page), { timeout: 20_000 })
    .toEqual(["weight", "meal", "water"]);
  await open(page);
  await restore(page);
  await expect(page.locator("[data-dashboard-card-slot]")).toHaveCount(4);
  expect(writes).toBe(1);
  expect((await readSaved()).hidden).toEqual(["progress"]);
  await page.getByRole("button", { name: "Ana ekran düzenlemeyi kapat" }).click();
  await page.getByRole("button", { name: "Kaydetmeden çık" }).click();
  await expect(page.locator("[data-dashboard-card-slot]")).toHaveCount(3);
  await open(page);
  await restore(page);
  await save(page);
  expect(writes).toBe(2);
  await page.reload();
  await expect(page.getByRole("button", { name: "Ana ekranı düzenle" })).toBeEnabled({
    timeout: 60_000,
  });
  await expect(page.locator("[data-dashboard-card-slot]")).toHaveCount(4, { timeout: 20_000 });
  await expect(page.locator("[data-quick-action-slot]")).toHaveCount(4, { timeout: 20_000 });
  expect((await readSaved()).hidden).toEqual([]);
  await expect(food.locator("[data-dashboard-card-hide]")).toHaveCount(0);
  await food.locator("[data-dashboard-live-feature-link]").click();
  await expect(page).toHaveURL(/\/meals\/scan(?:$|\?)/);
});
