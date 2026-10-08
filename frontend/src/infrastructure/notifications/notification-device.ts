export type DeviceNotificationPermission = "granted" | "denied" | "default" | "unavailable";
export interface NotificationDeviceState {
  platform: "native" | "web" | "unavailable";
  permission: DeviceNotificationPermission;
}
interface PermissionBridge {
  isAvailable?(): boolean;
  permissionStatus?(): string;
  requestPermission?(): void;
  openNotificationSettings?(): void;
}
function native(): PermissionBridge | undefined {
  if (typeof window === "undefined") return;
  return (window as unknown as { DiewishReminders?: PermissionBridge }).DiewishReminders;
}
/** Device facts are read live; they are never serialized into account preferences. */
export function notificationDeviceState(): NotificationDeviceState {
  const unavailable: NotificationDeviceState = {
    platform: "unavailable",
    permission: "unavailable",
  };
  if (typeof window === "undefined") return unavailable;
  try {
    const bridge = native();
    if (bridge?.isAvailable?.()) {
      const status = bridge.permissionStatus?.();
      return {
        platform: "native",
        permission:
          status === "granted" || status === "denied" || status === "default"
            ? status
            : "unavailable",
      };
    }
    if (window.isSecureContext && "Notification" in window && "serviceWorker" in navigator) {
      const status = Notification.permission;
      return {
        platform: "web",
        permission:
          status === "granted" || status === "denied" || status === "default"
            ? status
            : "unavailable",
      };
    }
  } catch {
    return unavailable;
  }
  return unavailable;
}
export async function requestDeviceNotificationPermission(): Promise<void> {
  const state = notificationDeviceState();
  if (state.platform === "native") {
    const bridge = native();
    if (state.permission === "denied" && typeof bridge?.openNotificationSettings === "function")
      bridge.openNotificationSettings();
    else if (typeof bridge?.requestPermission === "function") bridge.requestPermission();
    else throw new Error("Bu cihazın bildirim izni uygulamadan değiştirilemiyor.");
    return;
  }
  if (state.platform === "web" && state.permission === "default") {
    await Notification.requestPermission();
    return;
  }
  throw new Error("Bildirim iznini bu cihazın site veya uygulama ayarlarından kontrol et.");
}
