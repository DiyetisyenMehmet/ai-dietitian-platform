import { expect, test, type Page } from "@playwright/test";

const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
test.use({ viewport: { width: 390, height: 844 } });

async function setup(page: Page, granted: boolean) {
  const rows = [
    {
      id: "saved-thread",
      title: "Kaydedilmiş sohbet",
      pinnedAt: null,
      updatedAt: "2026-10-10T12:00:00Z",
    },
  ];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { success: true, data } });
    if (path.endsWith("/auth/refresh-token"))
      return ok({
        user: {
          id: "sync-user",
          fullName: "Test",
          onboardingCompleted: true,
          email: "synthetic@example.invalid",
          role: "USER",
        },
        tokens: { accessToken: "synthetic-token" },
      });
    if (path.endsWith("/legal/consents")) return ok({ allMandatoryGranted: granted, items: [] });
    if (path.endsWith("/onboarding")) return ok({ profile: null });
    if (path.endsWith("/ai-chat/conversations")) return ok({ conversations: rows });
    const id = path.split("/").pop();
    if (path.includes("/ai-chat/conversations/")) {
      const row = rows.find((r) => r.id === id);
      return ok({
        conversation: {
          ...row,
          messages: [
            {
              id: "msg-" + id,
              role: "USER",
              content: "Kalıcı mesaj " + id,
              createdAt: row?.updatedAt,
            },
          ],
        },
      });
    }
    return route.fulfill({
      status: 503,
      json: { success: false, error: { code: "UNUSED", message: "Unused" } },
    });
  });
  return rows;
}

for (const granted of [true, false]) {
  test(`direct authenticated coach navigation loads persisted history, consent=${granted}`, async ({
    page,
  }) => {
    await setup(page, granted);
    await page.goto(base + "/ai");
    await expect(page.getByText("Kalıcı mesaj saved-thread", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sohbet geçmişi", exact: true }).click();
    await expect(
      page
        .getByRole("navigation", { name: "Sohbetler" })
        .getByText("Kaydedilmiş sohbet", { exact: true }),
    ).toBeVisible();
  });
}

test("open history receives another session's conversation and keeps the active draft", async ({
  page,
}) => {
  const rows = await setup(page, false);
  await page.goto(base + "/ai");
  await expect(page.getByText("Kalıcı mesaj saved-thread", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sohbet geçmişi", exact: true }).click();
  await page.getByRole("button", { name: "Yeni Sohbet", exact: true }).click();
  await page.getByLabel("Mesaj", { exact: true }).fill("Gönderilmemiş taslak");
  await page.getByRole("button", { name: "Sohbet geçmişi", exact: true }).click();
  rows.unshift({
    id: "remote-thread",
    title: "Diğer oturumdan gelen sohbet",
    pinnedAt: null,
    updatedAt: "2026-10-10T13:00:00Z",
  });
  await expect(
    page
      .getByRole("navigation", { name: "Sohbetler" })
      .getByText("Diğer oturumdan gelen sohbet", { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Mesaj", { exact: true })).toHaveValue("Gönderilmemiş taslak");
  await page.reload();
  await expect(page.getByText("Kalıcı mesaj remote-thread", { exact: true })).toBeVisible();
});
