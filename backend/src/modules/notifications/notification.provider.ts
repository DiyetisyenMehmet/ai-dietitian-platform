import { createHash } from "node:crypto";

import type { Notification } from "@prisma/client";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { notificationDeviceService } from "./notification-device.service";

export type NotificationDeliveryDisposition =
  | "delivered"
  | "retry"
  | "permanent_failure"
  | "no_devices"
  | "disabled";

export interface NotificationDeliveryResult {
  disposition: NotificationDeliveryDisposition;
  code?: string;
  deliveredDeviceKeys: string[];
}

export interface NotificationProvider {
  readonly name: string;
  send(
    notification: Notification,
    alreadyDeliveredDeviceKeys?: ReadonlySet<string>,
  ): Promise<NotificationDeliveryResult>;
}

export type FcmFailureClass = "invalid-token" | "retryable" | "config" | "permanent";

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

export function classifyFcmFailure(status: number, code?: string): FcmFailureClass {
  if (code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH") return "invalid-token";
  if (
    code === "QUOTA_EXCEEDED" ||
    code === "UNAVAILABLE" ||
    code === "INTERNAL" ||
    status === 408 ||
    status === 429 ||
    status >= 500
  ) return "retryable";
  if (code === "THIRD_PARTY_AUTH_ERROR" || status === 401 || status === 403) return "config";
  return "permanent";
}

function deviceKey(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 24);
}

/**
 * Real Android push provider for the isolated staging Cloud Run service.
 * It uses the service account already attached to Cloud Run and therefore does
 * not add or persist a service-account private key in Diewish.
 */
export class FirebaseCloudMessagingProvider implements NotificationProvider {
  public readonly name = "firebase-cloud-messaging";

  async send(
    notification: Notification,
    alreadyDeliveredDeviceKeys: ReadonlySet<string> = new Set<string>(),
  ): Promise<NotificationDeliveryResult> {
    if (!isStagingRemotePushEnabled()) {
      return { disposition: "disabled", code: "FCM_DISABLED", deliveredDeviceKeys: [] };
    }
    const projectId = env.GOOGLE_CLOUD_PROJECT.trim();
    const authToken = await accessToken();
    if (!authToken) {
      return { disposition: "retry", code: "FCM_AUTH_UNAVAILABLE", deliveredDeviceKeys: [] };
    }

    const deviceTokens = await notificationDeviceService.activeTokens(notification.userId);
    if (deviceTokens.length === 0) {
      return { disposition: "no_devices", code: "NO_ACTIVE_DEVICE", deliveredDeviceKeys: [] };
    }

    const pendingTokens = deviceTokens.filter((token) => !alreadyDeliveredDeviceKeys.has(deviceKey(token)));
    if (pendingTokens.length === 0) {
      return { disposition: "delivered", deliveredDeviceKeys: [] };
    }

    const deliveredDeviceKeys: string[] = [];
    let retryRequired = false;
    let lastRetryCode: string | undefined;
    let permanentFailures = 0;

    for (const token of pendingTokens) {
      const key = deviceKey(token);
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
          deliveredDeviceKeys.push(key);
          continue;
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = undefined;
        }
        const code = fcmErrorCode(payload);
        const failureClass = classifyFcmFailure(response.status, code);
        if (failureClass === "invalid-token") {
          await notificationDeviceService.disableToken(token);
          permanentFailures += 1;
        } else if (failureClass === "retryable" || failureClass === "config") {
          retryRequired = true;
          lastRetryCode = code ?? `HTTP_${response.status}`;
        } else {
          permanentFailures += 1;
        }
        logger.warn(
          {
            notificationId: notification.id,
            status: response.status,
            fcmCode: code,
            failureClass,
          },
          "FCM notification delivery was rejected",
        );
      } catch (error) {
        retryRequired = true;
        lastRetryCode = "NETWORK_OR_TIMEOUT";
        logger.warn(
          { err: error, notificationId: notification.id },
          "FCM notification delivery failed",
        );
      }
    }

    if (retryRequired) {
      return {
        disposition: "retry",
        code: lastRetryCode ?? "FCM_RETRY",
        deliveredDeviceKeys,
      };
    }
    if (deliveredDeviceKeys.length > 0 || alreadyDeliveredDeviceKeys.size > 0) {
      return { disposition: "delivered", deliveredDeviceKeys };
    }
    return {
      disposition: "permanent_failure",
      code: permanentFailures > 0 ? "FCM_PERMANENT_FAILURE" : "FCM_NO_DELIVERY",
      deliveredDeviceKeys,
    };
  }
}

/** Non-staging fallback that deliberately does not pretend a push was sent. */
export class LoggingNotificationProvider implements NotificationProvider {
  public readonly name = "logging";

  async send(notification: Notification): Promise<NotificationDeliveryResult> {
    logger.info(
      {
        notificationId: notification.id,
        userId: notification.userId,
        type: notification.type,
        scheduledFor: notification.scheduledFor,
      },
      "[LoggingNotificationProvider] Push delivery is disabled",
    );
    return { disposition: "disabled", code: "FCM_DISABLED", deliveredDeviceKeys: [] };
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
