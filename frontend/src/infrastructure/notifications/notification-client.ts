import type { NotificationPreferences } from "@/domain/account/types";
import { apiRequest } from "@/infrastructure/api/http-client";
import { NOTIFICATION_ENDPOINTS } from "@/infrastructure/auth/endpoints";

export type UpdateNotificationPreferences = Partial<Omit<NotificationPreferences, "id" | "userId">>;

export const notificationClient = {
  getPreferences() {
    return apiRequest<{ preferences: NotificationPreferences }>({
      path: NOTIFICATION_ENDPOINTS.preferences,
      method: "GET",
      auth: true,
    });
  },

  updatePreferences(input: UpdateNotificationPreferences) {
    return apiRequest<{ preferences: NotificationPreferences }>({
      path: NOTIFICATION_ENDPOINTS.preferences,
      method: "PATCH",
      auth: true,
      body: JSON.stringify(input),
    });
  },

  registerDevice(input: { token: string; platform: "android" | "web"; appVersion?: string }) {
    return apiRequest<{ registered: true }>({
      path: NOTIFICATION_ENDPOINTS.devices,
      method: "POST",
      auth: true,
      body: JSON.stringify(input),
    });
  },

  sendTestNotification() {
    return apiRequest<{
      disposition: "delivered" | "retry" | "permanent_failure" | "no_devices" | "disabled";
      code: string | null;
      deliveredDeviceCount: number;
    }>({
      path: "/notifications/test",
      method: "POST",
      auth: true,
    });
  },

  unregisterDevice(token: string) {
    return apiRequest<{ registered: false }>({
      path: NOTIFICATION_ENDPOINTS.unregisterDevice,
      method: "POST",
      auth: true,
      body: JSON.stringify({ token }),
    });
  },
} as const;
