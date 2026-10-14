import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const now = new Date("2026-10-14T12:00:00+03:00");
type Message = { id: string; role: string; content: string; createdAt: string };
type Thread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pinnedAt: string | null;
  messages: Message[];
};

// Shared synthetic API contract, including summary-only lists and P2 disabled.
// No staging account, real message, database write or native device is used here.
function fixture() {
  const thread = (id: string, title: string, updatedAt: string): Thread => ({
    id,
    title,
    updatedAt,
    createdAt: updatedAt,
    pinnedAt: null,
    messages: [
      { id: `message-${id}`, role: "USER", content: `Kayıtlı mesaj ${id}`, createdAt: updatedAt },
    ],
  });
  const rows = [
    thread("saved-a", "Başlangıç sohbeti", now.toISOString()),
    thread(
      "saved-b",
      "Bugünkü öğünlerimi analiz eder misin?",
      new Date(now.getTime() - 60000).toISOString(),
    ),
  ];
  const operations: string[] = [];
  const details: string[] = [];
  const bind = async (context: BrowserContext) => {
    let signedIn = true;
    await context.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const ok = (data: unknown, status = 200) =>
        route.fulfill({ status, json: { success: true, data } });
      const session = {
        user: {
          id: "list-owner",
          fullName: "Synthetic Test",
          email: "list@example.invalid",
          role: "USER",
          isActive: true,
          onboardingCompleted: true,
          createdAt: now.toISOString(),
        },
        tokens: { accessToken: "synthetic-test-token", tokenType: "Bearer", expiresIn: "15m" },
      };
      if (path.endsWith("/auth/login")) {
        signedIn = true;
        return ok(session);
      }
      if (path.endsWith("/auth/logout")) {
        signedIn = false;
        operations.push("logout");
        return ok({});
      }
      if (path.endsWith("/auth/refresh-token"))
        return signedIn
          ? ok(session)
          : route.fulfill({
              status: 401,
              json: {
                success: false,
                error: { code: "UNAUTHORIZED", message: "Synthetic logout" },
              },
            });
      if (path.endsWith("/legal/consents")) return ok({ allMandatoryGranted: true, items: [] });
      if (path.endsWith("/onboarding")) return ok({ profile: null });
      if (path.endsWith("/ai-chat/events"))
        return route.fulfill({
          status: 409,
          json: { success: false, error: { code: "COACH_SYNC_DISABLED", message: "P1 fixture" } },
        });
      if (path.endsWith("/ai-chat/messages") && method === "POST") {
        operations.push("send");
        const body = route.request().postDataJSON();
        expect(body.conversationId ?? "").not.toMatch(/^draft-/);
        const id = body.conversationId || `saved-${rows.length + 1}`;
        let row = rows.find((item) => item.id === id);
        if (!row) {
          row = { ...thread(id, body.message, now.toISOString()), messages: [] };
          rows.unshift(row);
        }
        row.updatedAt = now.toISOString();
        row.messages.push({
          id: `user-${id}`,
          role: "USER",
          content: body.message,
          createdAt: row.updatedAt,
        });
        const message = {
          id: `answer-${id}`,
          role: "ASSISTANT",
          content: "Sentetik yanıt",
          createdAt: row.updatedAt,
        };
        row.messages.push(message);
        return ok({ conversationId: id, message }, 201);
      }
      if (path.endsWith("/ai-chat/conversations") && method === "GET")
        return ok({ conversations: rows.map(({ messages: _messages, ...summary }) => summary) });
      if (path.includes("/ai-chat/conversations/") && method === "GET") {
        const id = path.split("/").pop();
        details.push(id!);
        return ok({ conversation: rows.find((row) => row.id === id) });
      }
      if (path.includes("/ai-chat/")) operations.push(`${method} ${path}`);
      return route.fulfill({
        status: 503,
        json: { success: false, error: { code: "UNUSED", message: "Unused fixture endpoint" } },
      });
    });
  };
  return { rows, operations, details, bind };
}

async function openList(page: Page) {
  const nav = page.getByRole("navigation", { name: "Sohbetler" });
  if ((page.viewportSize()?.width ?? 0) < 1024 && !(await nav.isVisible()))
    await page.getByRole("button", { name: "Sohbet geçmişi", exact: true }).click();
  await expect(nav).toBeVisible();
  return nav;
}

test.use({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Istanbul" });

test("unloaded saved summaries keep their date; unsent drafts stay out of history without writes", async ({
  page,
  context,
}) => {
  const api = fixture();
  await api.bind(context);
  await page.clock.setFixedTime(now);
  await page.goto(base + "/ai");
  await expect(page.getByText("Kayıtlı mesaj saved-a", { exact: true })).toBeVisible();
  let nav = await openList(page);
  await expect(
    nav.getByRole("button", { name: /Bugünkü öğünlerimi analiz eder misin\? Bugün/ }),
  ).toBeVisible();
  expect(api.details).not.toContain("saved-b");
  await nav.getByRole("button", { name: "Yeni Sohbet", exact: true }).click();
  await page.getByLabel("Mesaj", { exact: true }).fill("Gönderilmemiş taslak");
  nav = await openList(page);
  await expect(nav.getByText("Yeni sohbet", { exact: true })).toHaveCount(0);
  await expect(nav.getByText("Boş", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Mesaj", { exact: true })).toHaveValue("Gönderilmemiş taslak");
  nav = await openList(page);
  await nav.getByRole("button", { name: /Bugünkü öğünlerimi analiz eder misin\? Bugün/ }).click();
  await expect(page.getByText("Kayıtlı mesaj saved-b", { exact: true })).toBeVisible();
  nav = await openList(page);
  await expect(nav.getByText("Bugün", { exact: true })).toHaveCount(2);
  await page.reload();
  nav = await openList(page);
  await expect(nav.getByText("Yeni sohbet", { exact: true })).toHaveCount(0);
  expect(api.operations).toEqual([]);
  expect(api.rows).toHaveLength(2);
});

test("a server-saved empty thread is retained while a local empty draft is hidden", async ({
  page,
  context,
}) => {
  const api = fixture();
  api.rows.push({
    id: "saved-empty",
    title: "Yeni sohbet",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    pinnedAt: now.toISOString(),
    messages: [],
  });
  await api.bind(context);
  await page.clock.setFixedTime(now);
  await page.goto(base + "/ai");
  await expect(page.getByText("Kayıtlı mesaj saved-a", { exact: true })).toBeVisible();
  let nav = await openList(page);
  await expect(
    nav.getByRole("button", { name: "Yeni sohbet sohbet seçenekleri", exact: true }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Yeni Sohbet", exact: true }).click();
  nav = await openList(page);
  await expect(nav.getByText("Yeni sohbet", { exact: true })).toHaveCount(1);
  await expect(nav.getByText("Boş", { exact: true })).toHaveCount(0);
  expect(api.rows).toHaveLength(3);
  expect(api.operations).toEqual([]);
});

test("activity labels use local calendar days across midnight, not elapsed 24-hour periods", async ({
  page,
  context,
}) => {
  const api = fixture();
  api.rows[0].updatedAt = "2026-10-13T23:59:00+03:00";
  api.rows[1].updatedAt = "2026-10-12T23:59:00+03:00";
  await api.bind(context);
  await page.clock.setFixedTime(new Date("2026-10-14T00:05:00+03:00"));
  await page.goto(base + "/ai");
  await expect(page.getByText("Kayıtlı mesaj saved-a", { exact: true })).toBeVisible();
  const nav = await openList(page);
  await expect(
    nav.getByRole("button", { name: "Başlangıç sohbeti Dün", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("button", {
      name: "Bugünkü öğünlerimi analiz eder misin? 2 gün önce",
      exact: true,
    }),
  ).toBeVisible();
});

for (const direction of ["mobile-to-web", "web-to-mobile"] as const) {
  test(`P1 summary-only history, saved messages, reload and logout/login: ${direction}`, async ({
    browser,
  }) => {
    test.setTimeout(60000);
    const api = fixture();
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      timezoneId: "Europe/Istanbul",
    });
    const web = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      timezoneId: "Europe/Istanbul",
    });
    try {
      for (const context of [mobile, web]) await api.bind(context);
      const [sourceContext, targetContext] =
        direction === "mobile-to-web" ? [mobile, web] : [web, mobile];
      const source = await sourceContext.newPage(),
        target = await targetContext.newPage();
      for (const page of [source, target]) {
        await page.clock.setFixedTime(now);
        await page.goto(base + "/ai");
        await expect(page.getByText("Kayıtlı mesaj saved-a", { exact: true })).toBeVisible();
      }
      let nav = await openList(target);
      await nav.getByRole("button", { name: "Yeni Sohbet", exact: true }).click();
      await target.getByLabel("Mesaj", { exact: true }).fill("Korunan taslak");
      nav = await openList(target);
      await expect(nav.getByText("Yeni sohbet", { exact: true })).toHaveCount(0);
      const sourceNav = await openList(source);
      await sourceNav.getByRole("button", { name: "Yeni Sohbet", exact: true }).click();
      const text = `Sentetik senkronizasyon ${direction}`;
      await source.getByLabel("Mesaj", { exact: true }).fill(text);
      await source.getByRole("button", { name: "Gönder", exact: true }).click();
      await expect(source.getByText("Sentetik yanıt", { exact: true })).toBeVisible();
      // Remote title comes from the canonical summary, not the optimistic shortened title.
      const remoteRow = nav.getByRole("button", { name: `${text} Bugün`, exact: true });
      await expect(remoteRow).toBeVisible({ timeout: 12000 });
      await expect(nav.getByText("Boş", { exact: true })).toHaveCount(0);
      expect(api.details).not.toContain(api.rows[0].id);
      await expect(target.getByLabel("Mesaj", { exact: true })).toHaveValue("Korunan taslak");
      await remoteRow.click();
      const savedMessage = target.getByText(text, { exact: true }).and(target.locator("p"));
      await expect(savedMessage).toBeVisible();
      await target.reload();
      await expect(savedMessage).toBeVisible();
      nav = await openList(target);
      await expect(nav.getByRole("button", { name: `${text} Bugün`, exact: true })).toBeVisible();
      await target.goto(base + "/profile");
      await target.getByRole("button", { name: "Çıkış yap", exact: true }).click();
      await expect(target).toHaveURL(/\/login/);
      await target.getByLabel("E-posta", { exact: true }).fill("list@example.invalid");
      await target.getByLabel("Şifre", { exact: true }).fill("Synthetic-only-password-1!");
      await target.getByRole("button", { name: "Giriş Yap", exact: true }).click();
      await expect(target).toHaveURL(/\/dashboard/);
      await target.goto(base + "/ai");
      await expect(savedMessage).toBeVisible();
      nav = await openList(target);
      await expect(nav.getByText("Boş", { exact: true })).toHaveCount(0);
      expect(api.rows).toHaveLength(3);
      expect(api.operations).toEqual(["send", "logout"]);
    } finally {
      await Promise.allSettled([mobile.close(), web.close()]);
    }
  });
}
