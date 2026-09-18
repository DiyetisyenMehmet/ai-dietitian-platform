"use client";

import { apiRequest } from "@/infrastructure/api/http-client";
import { resolveNotificationTypeTarget } from "@/infrastructure/notifications/notification-lifecycle";

const FIREBASE_CDN_VERSION = "12.19.0";
const WEB_PUSH_APP_NAME = "diewish-web-push";
const WEB_PUSH_TOKEN_KEY = "diewish:web-push-token";

interface FirebaseAppLike {
  name: string;
}

interface FirebaseMessagingLike {
  getToken(options?: {
    vapidKey?: string;
    serviceWorkerRegistration?: ServiceWorkerRegistration;
  }): Promise<string>;
  deleteToken(): Promise<boolean>;
}

interface FirebaseNamespaceLike {
  apps: FirebaseAppLike[];
  initializeApp(config: Record<string, string>, name?: string): FirebaseAppLike;
  messaging(app?: FirebaseAppLike): FirebaseMessagingLike;
}

interface PublicFirebaseConfigResponse {
  configured: boolean;
  config:
    | {
        apiKey: string;
        authDomain: string;
        projectId: string;
        appId: string;
        messagingSenderId?: string | null;
        webPushVapidKey?: string | null;
      }
    | null;
}

export interface WebPushMessage {
  notificationId: string;
  type: string;
  title: string;
  body: string;
  target: string;
}

export type WebPushPermission = NotificationPermission | "unsupported";

let contextPromise:
  | Promise<{
      messaging: FirebaseMessagingLike;
      registration: ServiceWorkerRegistration;
      vapidKey: string;
    }>
  | null = null;

function namespace(): FirebaseNamespaceLike | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { firebase?: FirebaseNamespaceLike }).firebase;
}

function loadScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = existing ?? document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Firebase messaging script unavailable"));
    };
    if (!existing) document.head.appendChild(script);
  });
}

async function runtimeConfig(): Promise<Record<string, string>> {
  const result = await apiRequest<PublicFirebaseConfigResponse>({
    path: "/identity/firebase-config",
    method: "GET",
    cache: "no-store",
    retryOnUnauthorized: false,
  });
  const config = result?.configured ? result.config : null;
  if (
    !config?.apiKey?.trim() ||
    !config.authDomain?.trim() ||
    !config.projectId?.trim() ||
    !config.appId?.trim() ||
    !config.messagingSenderId?.trim()
  ) {
    throw new Error("Firebase web messaging configuration unavailable");
  }
  return {
    apiKey: config.apiKey.trim(),
    authDomain: config.authDomain.trim(),
    projectId: config.projectId.trim(),
    appId: config.appId.trim(),
    messagingSenderId: config.messagingSenderId.trim(),
    ...(config.webPushVapidKey?.trim()
      ? { webPushVapidKey: config.webPushVapidKey.trim() }
      : {}),
  };
}

async function messagingContext() {
  if (contextPromise) return contextPromise;
  contextPromise = (async () => {
    const config = await runtimeConfig();
    await loadScript(
      "diewish-firebase-app",
      `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-app-compat.js`,
    );
    await loadScript(
      "diewish-firebase-messaging",
      `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-messaging-compat.js`,
    );

    const firebase = namespace();
    if (!firebase) throw new Error("Firebase messaging namespace unavailable");
    const app =
      firebase.apps.find((candidate) => candidate.name === WEB_PUSH_APP_NAME) ??
      firebase.initializeApp(
        {
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          appId: config.appId,
          messagingSenderId: config.messagingSenderId,
        },
        WEB_PUSH_APP_NAME,
      );

    const registration = await navigator.serviceWorker.register("/diewish-push-sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;

    return {
      messaging: firebase.messaging(app),
      registration,
      vapidKey: config.webPushVapidKey ?? "",
    };
  })();

  try {
    return await contextPromise;
  } catch (error) {
    contextPromise = null;
    throw error;
  }
}

export function isWebPushSupported(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      window.isSecureContext &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window,
  );
}

export function webPushPermissionStatus(): WebPushPermission {
  return isWebPushSupported() ? Notification.permission : "unsupported";
}

export function webPushCachedToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(WEB_PUSH_TOKEN_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function cacheToken(token: string): void {
  try {
    window.localStorage.setItem(WEB_PUSH_TOKEN_KEY, token);
  } catch {
    // Registration still works when storage is unavailable; server ownership
    // and Firebase invalid-token cleanup remain authoritative.
  }
}

function clearCachedToken(): void {
  try {
    window.localStorage.removeItem(WEB_PUSH_TOKEN_KEY);
  } catch {
    // Best-effort local cleanup.
  }
}

export async function ensureWebPushToken(requestPermission: boolean): Promise<string | null> {
  if (!isWebPushSupported()) return null;

  let permission = Notification.permission;
  if (permission === "default" && requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return null;

  const { messaging, registration, vapidKey } = await messagingContext();
  const token = (
    await messaging.getToken({
      serviceWorkerRegistration: registration,
      ...(vapidKey ? { vapidKey } : {}),
    })
  ).trim();
  if (!token) return null;
  cacheToken(token);
  return token;
}

export async function deleteWebPushToken(): Promise<void> {
  const cached = webPushCachedToken();
  clearCachedToken();
  if (!cached || !isWebPushSupported()) return;

  try {
    const { messaging } = await messagingContext();
    await messaging.deleteToken();
  } catch {
    // Backend ownership is released before this call. Firebase will eventually
    // invalidate an unreachable token even if local deletion is offline.
  }
}

export function subscribeWebPushMessages(
  listener: (message: WebPushMessage) => void,
): () => void {
  if (!isWebPushSupported()) return () => undefined;

  const handler = (event: MessageEvent) => {
    const payload = event.data as Record<string, unknown> | null;
    if (!payload || payload.source !== "diewish-push") return;
    const notificationId =
      typeof payload.notificationId === "string" ? payload.notificationId.trim() : "";
    const type = typeof payload.type === "string" ? payload.type.trim() : "";
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!notificationId || !title || !body) return;
    listener({
      notificationId,
      type,
      title,
      body,
      target: resolveNotificationTypeTarget(type),
    });
  };

  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}

export function isStagingNotificationHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "staging.diewish.com" || host.startsWith("diewish-frontend-staging-");
}
