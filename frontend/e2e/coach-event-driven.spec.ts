import { randomBytes } from "node:crypto";
import { chromium, webkit, expect, test, type BrowserContext, type Page } from "@playwright/test";

const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const api = process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api";
const writer = "http://127.0.0.1:4002/api";
test.use({ trace: "off", screenshot: "off", video: "off" });
test.setTimeout(150000);
async function list(page: Page) {
  const nav = page.getByRole("navigation", { name: "Sohbetler" });
  if ((page.viewportSize()?.width ?? 0) < 1024 && !(await nav.isVisible())) {
    await page.getByRole("button", { name: "Sohbet geçmişi", exact: true }).click();
  }
  await expect(nav).toBeVisible();
  return nav;
}
async function closeList(page: Page) {
  if ((page.viewportSize()?.width ?? 0) < 1024 && (await page.getByRole("dialog").isVisible()))
    await page.keyboard.press("Escape");
}

test("three browser clients: six directions, zero idle list polling, lifecycle and history recovery", async () => {
  // Chromium mobile is web-code evidence, never an Android runtime assertion.
  // Playwright WebKit is browser-engine evidence, never an iOS Simulator assertion.
  const chrome = await chromium.launch(),
    safari = await webkit.launch();
  const contexts: BrowserContext[] = [];
  try {
    contexts.push(await chrome.newContext({ viewport: { width: 1440, height: 900 } }));
    contexts.push(
      await chrome.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      }),
    );
    contexts.push(
      await safari.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      }),
    );
    const email = `event.${randomBytes(10).toString("hex")}@example.invalid`,
      password = randomBytes(24).toString("base64url") + "aA1";
    const registration = await contexts[0].request.post(api + "/auth/register", {
      data: { email, password, fullName: "Synthetic Coach User" },
    });
    expect(registration.status()).toBe(201);
    const account = (await registration.json()).data;
    const headers = { authorization: `Bearer ${account.tokens.accessToken}` };
    for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"])
      expect(
        (
          await contexts[0].request.post(api + "/legal/consents", { headers, data: { type } })
        ).status(),
      ).toBe(200);
    expect(
      (
        await contexts[0].request.post(api + "/onboarding", {
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
    // Cookies belong to the first-party frontend, just as in the existing auth harness.
    for (const context of contexts)
      expect(
        (
          await context.request.post(base + "/api/auth/login", { data: { email, password } })
        ).status(),
      ).toBe(200);
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    const listCalls = [0, 0, 0],
      detailCalls = [0, 0, 0],
      eventCalls = [0, 0, 0],
      changed = [0, 0, 0],
      readyCalls = [0, 0, 0],
      pendingReads = [0, 0, 0];
    let historyActivity = performance.now();
    for (const [index, page] of pages.entries()) {
      page.on("request", (request) => {
        const pathname = new URL(request.url()).pathname;
        if (request.method() === "GET" && pathname.startsWith("/api/ai-chat/conversations")) {
          pendingReads[index]++;
          historyActivity = performance.now();
        }
        if (pathname === "/api/ai-chat/conversations") listCalls[index]++;
        else if (
          /\/api\/ai-chat\/conversations\/[^/]+$/.test(pathname) &&
          request.method() === "GET"
        )
          detailCalls[index]++;
        if (pathname === "/api/ai-chat/events") eventCalls[index]++;
      });
      const finished = (request: import("@playwright/test").Request) => {
        if (
          request.method() === "GET" &&
          new URL(request.url()).pathname.startsWith("/api/ai-chat/conversations")
        ) {
          pendingReads[index]--;
          historyActivity = performance.now();
        }
      };
      page.on("requestfinished", finished);
      page.on("requestfailed", finished);
      await page.exposeFunction("coachTestEvent", (type: string) => {
        if (type === "changed") changed[index]++;
        if (type === "ready") readyCalls[index]++;
      });
      await page.addInitScript(() => {
        const original = window.fetch.bind(window);
        window.fetch = async (...args) => {
          const response = await original(...args);
          const request = args[0];
          const url =
            typeof request === "string"
              ? request
              : request instanceof URL
                ? request.href
                : request.url;
          if (url.endsWith("/ai-chat/events") && response.body && response.ok) {
            const copy = response.clone();
            void (async () => {
              const reader = copy.body!.getReader(),
                decoder = new TextDecoder();
              let buffer = "";
              try {
                while (true) {
                  const chunk = await reader.read();
                  if (chunk.done) break;
                  buffer += decoder.decode(chunk.value, { stream: true });
                  let separator: number;
                  while ((separator = buffer.indexOf("\n\n")) >= 0) {
                    const frame = buffer.slice(0, separator);
                    buffer = buffer.slice(separator + 2);
                    const type = frame
                      .split("\n")
                      .find((item) => item.startsWith("event:"))
                      ?.slice(6)
                      .trim();
                    if (!type || !["ready", "changed"].includes(type)) continue;
                    const line = frame.split("\n").find((item) => item.startsWith("data:"));
                    if (line)
                      await (
                        window as typeof window & {
                          coachTestEvent: (type: string) => Promise<void>;
                        }
                      ).coachTestEvent(type);
                  }
                }
              } catch {
                /* Disconnection is part of this test; no content is retained. */
              }
            })();
          }
          return response;
        };
      });
      if (index > 0)
        await page.route("**/api/ai-chat/events", (route) =>
          route.continue({ url: `http://127.0.0.1:${4000 + index}/api/ai-chat/events` }),
        );
      await page.route("**/api/ai-chat/messages", (route) =>
        route.continue({ url: writer + "/ai-chat/messages" }),
      );
      await page.goto(base + "/ai");
      await expect(page.getByLabel("Mesaj", { exact: true })).toBeVisible();
    }
    await expect.poll(() => eventCalls.every((value) => value >= 1)).toBe(true);
    // Stabilize after the initial ready snapshot, then measure idle requests with
    // a bounded observation window longer than two old 5-second intervals.
    await expect.poll(() => listCalls.every((value) => value >= 1)).toBe(true);
    await Promise.all(
      pages.map((page) => expect(page.getByLabel("Mesaj", { exact: true })).toBeEnabled()),
    );
    await expect
      .poll(
        () =>
          readyCalls.every((n) => n > 0) &&
          pendingReads.every((n) => n === 0) &&
          performance.now() - historyActivity > 500,
      )
      .toBe(true);
    const idleBefore = [...listCalls],
      detailsBefore = [...detailCalls];
    await new Promise((resolve) => setTimeout(resolve, 11500));
    expect(listCalls).toEqual(idleBefore);
    expect(detailCalls).toEqual(detailsBefore);
    console.log(
      `COACH_IDLE_BROWSER_LIST_REQUESTS_11_5S=${listCalls.map((n, i) => n - idleBefore[i]).join(",")}`,
    );
    const directions = [
      [1, 0],
      [0, 1],
      [2, 0],
      [0, 2],
      [1, 2],
      [2, 1],
    ];
    const latencies: number[] = [];
    let sharedId = "",
      sharedTitle = "";
    for (const [sourceIndex, targetIndex] of directions) {
      const source = pages[sourceIndex],
        target = pages[targetIndex];
      await closeList(source);
      await closeList(target);
      const text = `Senkron ${randomBytes(5).toString("hex")}`;
      await list(source);
      await source.getByRole("button", { name: "Yeni Sohbet", exact: true }).click();
      await source.getByLabel("Mesaj", { exact: true }).fill(text);
      const responsePromise = source.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/ai-chat/messages" &&
          response.request().method() === "POST",
      );
      await source.getByRole("button", { name: "Gönder", exact: true }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(201);
      const id = (await response.json()).data.conversationId;
      sharedId = id;
      sharedTitle = text;
      const committedAt = performance.now();
      const nav = await list(target);
      await expect(nav.getByText(text, { exact: true })).toBeVisible({ timeout: 5000 });
      latencies.push(performance.now() - committedAt);
      expect(await nav.getByText(text, { exact: true }).count()).toBe(1);
      expect(
        (
          await (
            await contexts[0].request.get(api + `/ai-chat/conversations/${id}`, { headers })
          ).json()
        ).data.conversation.messages.length,
      ).toBe(2);
    }
    expect(changed.every((value) => value >= 6)).toBe(true);
    console.log(`COACH_SIX_DIRECTION_UI_MS=${latencies.map(Math.ceil).join(",")}`);
    // All three active views reconcile the same canonical history without
    // clearing unsent composer text or selecting a different conversation.
    for (const [index, page] of pages.entries()) {
      const nav = await list(page);
      await nav.getByText(sharedTitle, { exact: true }).click();
      await closeList(page);
      await expect(page.getByLabel("Mesaj", { exact: true })).toBeEnabled();
      await page.getByLabel("Mesaj", { exact: true }).fill(`Gönderilmemiş taslak ${index}`);
    }
    const remoteText = `Ortak mesaj ${randomBytes(5).toString("hex")}`;
    const longText = "Geçmiş okumak için sentetik satır. ".repeat(100);
    expect(
      (
        await contexts[0].request.post(writer + "/ai-chat/messages", {
          headers,
          data: { conversationId: sharedId, message: longText },
        })
      ).status(),
    ).toBe(201);
    for (const page of pages) {
      await expect(page.getByText(longText.trim(), { exact: true })).toBeVisible();
      await page.getByText(longText.trim(), { exact: true }).evaluate((message) => {
        let scroll = message.parentElement;
        while (scroll && getComputedStyle(scroll).overflowY !== "auto")
          scroll = scroll.parentElement;
        if (!scroll || scroll.scrollHeight - scroll.clientHeight < 150)
          throw new Error("History fixture must overflow");
        scroll.scrollTop = 0;
      });
    }
    expect(
      (
        await contexts[0].request.post(writer + "/ai-chat/messages", {
          headers,
          data: { conversationId: sharedId, message: remoteText },
        })
      ).status(),
    ).toBe(201);
    for (const [index, page] of pages.entries()) {
      await expect(page.getByText(remoteText, { exact: true })).toBeAttached();
      await expect(page.getByLabel("Mesaj", { exact: true })).toHaveValue(
        `Gönderilmemiş taslak ${index}`,
      );
      await expect
        .poll(() =>
          page.getByText(longText.trim(), { exact: true }).evaluate((message) => {
            let scroll = message.parentElement;
            while (scroll && getComputedStyle(scroll).overflowY !== "auto")
              scroll = scroll.parentElement;
            return scroll?.scrollTop;
          }),
        )
        .toBeLessThan(5);
    }
    const renamed = `Başlık ${randomBytes(5).toString("hex")}`;
    expect(
      (
        await contexts[0].request.patch(writer + `/ai-chat/conversations/${sharedId}`, {
          headers,
          data: { title: renamed },
        })
      ).status(),
    ).toBe(200);
    for (const page of pages) {
      const nav = await list(page);
      await expect(nav.getByText(renamed, { exact: true })).toBeVisible();
    }
    for (const pinned of [true, false]) {
      expect(
        (
          await contexts[0].request.patch(writer + `/ai-chat/conversations/${sharedId}/pin`, {
            headers,
            data: { pinned },
          })
        ).status(),
      ).toBe(200);
      await expect
        .poll(
          async () =>
            (
              await (
                await contexts[0].request.get(api + `/ai-chat/conversations/${sharedId}/summary`, {
                  headers,
                })
              ).json()
            ).data.conversation.pinnedAt !== null,
        )
        .toBe(pinned);
      for (const page of pages) {
        const nav = await list(page);
        if (pinned) await expect(nav.getByText("Sabitlenenler", { exact: true })).toBeVisible();
        else await expect(nav.getByText("Sabitlenenler", { exact: true })).toHaveCount(0);
      }
    }
    expect(
      (
        await contexts[0].request.delete(writer + `/ai-chat/conversations/${sharedId}`, { headers })
      ).status(),
    ).toBe(204);
    for (const page of pages) {
      const nav = await list(page);
      await expect(nav.getByText(renamed, { exact: true })).toHaveCount(0);
      await closeList(page);
    }
    // Native bridge contract in shared JS, without claiming a physical device.
    await pages[1].evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("diewish:app-visibility", { detail: { active: false } }),
      ),
    );
    await pages[2].evaluate(() => window.dispatchEvent(new Event("pagehide")));
    const backgroundLists = [...listCalls],
      backgroundEvents = [...eventCalls];
    await new Promise((resolve) => setTimeout(resolve, 5500));
    expect(listCalls[1]).toBe(backgroundLists[1]);
    expect(listCalls[2]).toBe(backgroundLists[2]);
    expect(eventCalls[1]).toBe(backgroundEvents[1]);
    expect(eventCalls[2]).toBe(backgroundEvents[2]);
    const missedText = `Uyku sonrası ${randomBytes(5).toString("hex")}`;
    expect(
      (
        await contexts[0].request.post(writer + "/ai-chat/messages", {
          headers,
          data: { message: missedText },
        })
      ).status(),
    ).toBe(201);
    await pages[1].evaluate(() =>
      window.dispatchEvent(new CustomEvent("diewish:app-visibility", { detail: { active: true } })),
    );
    await pages[2].evaluate(() => window.dispatchEvent(new Event("pageshow")));
    await expect
      .poll(() => eventCalls[1] > backgroundEvents[1] && eventCalls[2] > backgroundEvents[2])
      .toBe(true);
    for (const page of pages.slice(1)) {
      const nav = await list(page);
      await expect(nav.getByText(missedText, { exact: true })).toBeVisible();
      await closeList(page);
    }
    await contexts[2].setOffline(true);
    await pages[2].evaluate(() => window.dispatchEvent(new Event("offline")));
    await contexts[2].setOffline(false);
    await pages[2].evaluate(() => window.dispatchEvent(new Event("online")));
    await pages[2].reload();
    await expect(pageLastThread(pages[2])).toBeVisible();
    await pages[1].goto(base + "/dashboard");
    const leftCount = eventCalls[1];
    await new Promise((resolve) => setTimeout(resolve, 5500));
    expect(eventCalls[1]).toBe(leftCount);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    await chrome.close();
    await safari.close();
  }
});
function pageLastThread(page: Page) {
  return page.getByLabel("Mesaj", { exact: true });
}
