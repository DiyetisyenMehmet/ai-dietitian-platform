import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const fixtures = JSON.parse(
  readFileSync(process.env.NUTRITION_TEST_FIXTURE_FILE || "/tmp/nutrition-fixtures.json", "utf8"),
);

async function open(page: Page, name: string) {
  await page.goto(`${base}/login`);
  await page.getByLabel("E-posta").fill(fixtures[name].email);
  await page.getByLabel("Şifre", { exact: true }).fill(fixtures[name].password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
  await page.goto(`${base}/meals/plan`);
  await expect(page.getByRole("button", { name: "Yeni plan oluştur" })).toHaveCount(3);
}

for (const [fixture, days, index] of [
  ["premium7", 7, 0],
  ["premium14", 14, 1],
  ["premium30", 30, 2],
] as const) {
  test(`eligible Premium ${days} days: real create button, loading, active plan and reload`, async ({
    page,
    request,
  }) => {
    await open(page, fixture);
    let calls = 0;
    page.on("request", (req) => {
      if (req.url().endsWith("/nutrition-plans/generate")) calls++;
    });
    await page.getByRole("button", { name: "Yeni plan oluştur" }).nth(index).click();
    await expect(page.getByRole("button", { name: "Hazırlanıyor…" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Yeni plan oluştur" }).first()).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: `${days} günlük kişisel plan`, exact: true }),
    ).toBeVisible({ timeout: 30000 });
    expect(calls).toBe(1);
    const response = await request.get("http://127.0.0.1:4000/api/nutrition-plans", {
      headers: { authorization: `Bearer ${fixtures[fixture].token}` },
    });
    expect(response.status()).toBe(200);
    const plans = (await response.json()).data.plans;
    expect(plans).toHaveLength(1);
    expect(plans[0].status).toBe("COMPLETED");
    expect(plans[0].isActive).toBe(true);
    expect(plans[0].dailyPlans.cycle).toHaveLength(days);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: `${days} günlük kişisel plan`, exact: true }),
    ).toBeVisible();
  });
}
test("FREE 14/30 explains entitlement; failure unlocks and 7 succeeds", async ({ page }) => {
  await open(page, "free");
  for (const index of [1, 2]) {
    await page.getByRole("button", { name: "Yeni plan oluştur" }).nth(index).click();
    await expect(
      page
        .getByText(
          "Ücretsiz planda 7 günlük başlangıç planı oluşturabilirsin. 14 ve 30 günlük planlar için Premium veya Premium Plus gerekir.",
        )
        .first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Yeni plan oluştur" }).first()).toBeEnabled();
  }
  await page.getByRole("button", { name: "Yeni plan oluştur" }).first().click();
  await expect(
    page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true }),
  ).toBeVisible({ timeout: 30000 });
});
test("weight check-in notice agrees with disabled generation controls", async ({ page }) => {
  await open(page, "weightDue");
  await expect(page.getByText("Haftalık kilo check-inin gerekli", { exact: true })).toBeVisible();
  for (const button of await page.getByRole("button", { name: "Yeni plan oluştur" }).all())
    await expect(button).toBeDisabled();
});

test("slow bounded generation survives the previous 30-second same-origin proxy limit", async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page, "slow7");
  const started = Date.now();
  const response = page.waitForResponse((res) => res.url().endsWith("/nutrition-plans/generate"));
  await page.getByRole("button", { name: "Yeni plan oluştur" }).first().click();
  await expect(page.getByRole("button", { name: "Hazırlanıyor…" })).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  expect((await response).status()).toBe(201);
  expect(Date.now() - started).toBeGreaterThan(30000);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true }),
  ).toBeVisible();
});
