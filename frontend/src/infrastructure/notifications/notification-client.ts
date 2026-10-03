import type { NotificationPreferences } from "@/domain/account/types";
import { apiRequest } from "@/infrastructure/api/http-client";
import { NOTIFICATION_ENDPOINTS } from "@/infrastructure/auth/endpoints";

export type UpdateNotificationPreferences = Partial<Omit<NotificationPreferences, "id" | "userId">>;

export interface NotificationCenterApiItem {
  id: string;
  type: string;
  title: string;
  body: string;
  scheduledFor: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export const notificationClient = {
  getCenter() {
    return apiRequest<{ notifications: NotificationCenterApiItem[]; unreadCount: number }>({
      path: NOTIFICATION_ENDPOINTS.center,
      method: "GET",
      auth: true,
    });
  },

  markRead(id: string) {
    return apiRequest<{ notification: { id: string; readAt: string } }>({
      path: `/notifications/${encodeURIComponent(id)}/read`,
      method: "PATCH",
      auth: true,
    });
  },

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
