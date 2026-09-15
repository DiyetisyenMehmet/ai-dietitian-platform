import type { Notification } from "@prisma/client";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { notificationDeviceService } from "./notification-device.service";

export interface NotificationProvider {
  readonly name: string;
  send(notification: Notification): Promise<boolean>;
}

const ROUTES: Record<string, string> = {
  PROACTIVE_MESSAGE: "/ai",
  WEEKLY_REVIEW: "/insights",
  MONTHLY_REVIEW: "/insights",
  RISK_ALERT: "/insights",
  GOAL_REMINDER: "/goals",
  WATER_REMINDER: "/dashboard",
};

interface MetadataToken {
  access_token?: string;
  expires_in?: number;
}

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function isStagingRemotePushEnabled(): boolean {
  const explicit = process.env.DIEWISH_FCM_ENABLED?.trim().toLowerCase();
  if (explicit === "false") return false;
  if (explicit === "true") return Boolean(env.GOOGLE_CLOUD_PROJECT.trim());
  return Boolean(
    env.GOOGLE_CLOUD_PROJECT.trim() &&
      process.env.K_SERVICE?.trim().endsWith("-staging"),
  );
}

async function accessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.value;
  }

  try {
    const response = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      {
        headers: { "Metadata-Flavor": "Google" },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as MetadataToken;
    if (!payload.access_token) return null;
    cachedAccessToken = {
      value: payload.access_token,
      expiresAt: now + Math.max(60, payload.expires_in ?? 300) * 1_000,
    };
    return payload.access_token;
  } catch (error) {
    logger.warn({ err: error }, "FCM access token could not be obtained");
    return null;
  }
}

function fcmErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const details = (error as { details?: unknown }).details;
  if (!Array.isArray(details)) return undefined;
  for (const detail of details) {
    if (detail && typeof detail === "object") {
      const code = (detail as { errorCode?: unknown }).errorCode;
      if (typeof code === "string") return code;
    }
  }
  return undefined;
}

/**
 * Real Android push provider for the isolated staging Cloud Run service.
 * It uses the service account already attached to Cloud Run and therefore does
 * not add or persist a service-account private key in Diewish.
 */
export class FirebaseCloudMessagingProvider implements NotificationProvider {
  public readonly name = "firebase-cloud-messaging";

  async send(notification: Notification): Promise<boolean> {
    if (!isStagingRemotePushEnabled()) return false;
    const projectId = env.GOOGLE_CLOUD_PROJECT.trim();
    const authToken = await accessToken();
    if (!authToken) return false;

    const deviceTokens = await notificationDeviceService.activeTokens(notification.userId);
    if (deviceTokens.length === 0) return false;

    let delivered = false;
    for (const token of deviceTokens) {
      try {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${authToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token,
                data: {
                  notificationId: notification.id,
                  type: notification.type,
                  title: notification.title,
                  body: notification.body,
                  path: ROUTES[notification.type] ?? "/dashboard",
                },
                android: {
                  priority: "high",
                  collapse_key: `diewish-${notification.id}`,
                  ttl: "86400s",
                },
              },
            }),
            signal: AbortSignal.timeout(10_000),
          },
        );

        if (response.ok) {
          delivered = true;
          continue;
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = undefined;
        }
        const code = fcmErrorCode(payload);
        if (code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH") {
          await notificationDeviceService.disableToken(token);
        }
        logger.warn(
          { notificationId: notification.id, status: response.status, fcmCode: code },
          "FCM notification delivery was rejected",
        );
      } catch (error) {
        logger.warn(
          { err: error, notificationId: notification.id },
          "FCM notification delivery failed",
        );
      }
    }
    return delivered;
  }
}

/** Non-staging fallback that deliberately does not pretend a push was sent. */
export class LoggingNotificationProvider implements NotificationProvider {
  public readonly name = "logging";

  async send(notification: Notification): Promise<boolean> {
    logger.info(
      {
        notificationId: notification.id,
        userId: notification.userId,
        type: notification.type,
        scheduledFor: notification.scheduledFor,
      },
      "[LoggingNotificationProvider] Push delivery is disabled",
    );
    return false;
  }
}

let activeProvider: NotificationProvider = isStagingRemotePushEnabled()
  ? new FirebaseCloudMessagingProvider()
  : new LoggingNotificationProvider();

export function getNotificationProvider(): NotificationProvider {
  return activeProvider;
}

export function setNotificationProvider(provider: NotificationProvider): void {
  activeProvider = provider;
}
