"use strict";

const SAFE_TARGETS = new Set([
  "/dashboard",
  "/ai",
  "/insights",
  "/goals",
  "/meals",
  "/activity",
  "/sleep",
  "/progress",
  "/profile/blood-tests",
  "/profile/notifications",
]);

function targetForType(type) {
  if (type === "PROACTIVE_MESSAGE") return "/ai";
  if (type === "WEEKLY_REVIEW" || type === "MONTHLY_REVIEW" || type === "RISK_ALERT") {
    return "/insights";
  }
  if (type === "GOAL_REMINDER") return "/goals";
  if (type === "WATER_REMINDER") return "/dashboard";
  return "/dashboard";
}

function safeTarget(target) {
  return SAFE_TARGETS.has(target) ? target : "/dashboard";
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function extractData(payload) {
  if (!payload || typeof payload !== "object") return {};
  if (payload.data && typeof payload.data === "object") return payload.data;
  if (
    payload.message &&
    typeof payload.message === "object" &&
    payload.message.data &&
    typeof payload.message.data === "object"
  ) {
    return payload.message.data;
  }
  return {};
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    return;
  }

  const data = extractData(payload);
  const notificationId = clean(data.notificationId, 120);
  const type = clean(data.type, 80);
  const title = clean(data.title, 120);
  const body = clean(data.body, 500);
  if (!notificationId || !title || !body) return;

  const message = {
    source: "diewish-push",
    notificationId,
    type,
    title,
    body,
  };
  const target = targetForType(type);
  const tag = `diewish-${notificationId}`;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const visible = windows.filter((client) => client.visibilityState === "visible");
      if (visible.length > 0) {
        visible.forEach((client) => client.postMessage(message));
        return;
      }

      const existing =
        typeof self.registration.getNotifications === "function"
          ? await self.registration.getNotifications({ tag })
          : [];
      if (existing.length > 0) return;

      await self.registration.showNotification(title, {
        body,
        tag,
        renotify: false,
        data: { target },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeTarget(event.notification?.data?.target);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        try {
          if (new URL(client.url).origin !== self.location.origin) continue;
          if (typeof client.navigate === "function") await client.navigate(target);
          await client.focus();
          return;
        } catch {
          // Try another same-origin client or open a fresh window.
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
