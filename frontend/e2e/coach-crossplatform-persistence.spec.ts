import { randomBytes } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const api = process.env.E2E_API_BASE_URL || base + "/api";
test.setTimeout(120000);

async function authenticate(
  context: BrowserContext,
  email: string,
  password: string,
  register = false,
) {
  const response = await context.request.post(api + (register ? "/auth/register" : "/auth/login"), {
    data: { email, password, ...(register ? { fullName: "Synthetic Coach User" } : {}) },
  });
  expect(response.status()).toBe(register ? 201 : 200);
  return (await response.json()).data;
}
async function openList(page: Page) {
  const nav = page.getByRole("navigation", { name: "Sohbetler" });
  // Desktop history is always open; its mobile trigger is hidden. Wait for
  // account hydration before deciding whether the mobile drawer needs opening.
  if ((page.viewportSize()?.width ?? 0) < 1024 && !(await nav.isVisible())) {
    const trigger = page.getByRole("button", { name: "Sohbet geçmişi", exact: true });
    await expect(trigger).toBeVisible();
    await trigger.click();
  }
  await expect(nav).toBeVisible();
  return nav;
}

for (const direction of ["mobile-to-web", "web-to-mobile"]) {
  test(`real API persistence and two browser sessions: ${direction}`, async ({ browser }) => {
    // Mobile Chromium exercises the shared Android WebView web code, and is
    // explicitly not native Android Emulator/device evidence.
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const web = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const email = `coach.${randomBytes(10).toString("hex")}@example.invalid`;
      const password = randomBytes(24).toString("base64url") + "aA1";
      const registration = await authenticate(web, email, password, true);
      const headers = { authorization: `Bearer ${registration.tokens.accessToken}` };
      for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"]) {
        expect(
          (await web.request.post(api + "/legal/consents", { headers, data: { type } })).status(),
        ).toBe(200);
      }
      expect(
        (
          await web.request.post(api + "/onboarding", {
            headers,
            data: {
              fullName: "Synthetic Coach User",
              dateOfBirth: "1990-05-20",
              gender: "PREFER_NOT_TO_SAY",
              heightCm: 175,
              currentWeightKg: 70,
              targetWeightKg: 65,
              activityLevel: "MODERATE",
              healthConditions: [],
              allergies: [],
              dietaryPreference: "OMNIVORE",
              dailyWaterGoalMl: 2500,
              workScheduleType: "REGULAR",
              usualWakeTime: "07:00",
              usualSleepTime: "23:00",
            },
          })
        ).status(),
      ).toBe(200);
      const mobileSession = await authenticate(mobile, email, password);
      expect(mobileSession.user.id).toBe(registration.user.id);
      const [sourceContext, targetContext] =
        direction === "mobile-to-web" ? [mobile, web] : [web, mobile];
      const source = await sourceContext.newPage(),
        target = await targetContext.newPage();
      await target.goto(base + "/ai");
      await openList(target);
      await source.goto(base + "/ai");
      await openList(source);
      await source.getByRole("button", { name: "Yeni Sohbet", exact: true }).click();
      const text = "Merhaba " + randomBytes(6).toString("hex");
      await source.getByLabel("Mesaj", { exact: true }).fill(text);
      const pending = source.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/ai-chat/messages" &&
          response.request().method() === "POST",
      );
      await source.getByRole("button", { name: "Gönder", exact: true }).click();
      const response = await pending;
      expect(response.status()).toBe(201);
      const id = (await response.json()).data.conversationId;
      const list = await openList(target);
      await expect(list.getByText(text, { exact: true })).toBeVisible({ timeout: 12000 });
      expect(await list.getByText(text, { exact: true }).count()).toBe(1);
      const persisted = await web.request.get(api + `/ai-chat/conversations/${id}`, { headers });
      expect(persisted.status()).toBe(200);
      expect(
        (await persisted.json()).data.conversation.messages.map(
          (message: { role: string }) => message.role,
        ),
      ).toEqual(["USER", "ASSISTANT"]);
      await target.reload();
      await openList(target);
      await expect(
        target.getByRole("navigation", { name: "Sohbetler" }).getByText(text, { exact: true }),
      ).toBeVisible();
      expect((await targetContext.request.post(api + "/auth/logout")).status()).toBe(200);
      const relogin = await authenticate(targetContext, email, password);
      expect(relogin.user.id).toBe(registration.user.id);
      await target.reload();
      await openList(target);
      await expect(
        target.getByRole("navigation", { name: "Sohbetler" }).getByText(text, { exact: true }),
      ).toBeVisible();
    } finally {
      // Preserve the actual assertion/action failure if Playwright already
      // closed a context after a timeout; cleanup must not replace its cause.
      await Promise.allSettled([mobile.close(), web.close()]);
    }
  });
}
