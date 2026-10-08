"use client";
import * as React from "react";
import {
  notificationDeviceState,
  requestDeviceNotificationPermission,
  type NotificationDeviceState,
} from "@/infrastructure/notifications/notification-device";
import { Button } from "@/presentation/components/ui/button";

export function NotificationDeviceNotice({ enabled }: { enabled: boolean }) {
  const [device, setDevice] = React.useState<NotificationDeviceState>({
    platform: "unavailable",
    permission: "unavailable",
  });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    const refresh = () => setDevice(notificationDeviceState());
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("diewish:notification-state", refresh);
    document.addEventListener("visibilitychange", visible);
    let disposed = false;
    let permission: PermissionStatus | undefined;
    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "notifications" as PermissionName })
        .then((value) => {
          if (disposed) return;
          permission = value;
          value.addEventListener("change", refresh);
        })
        .catch(() => undefined);
    }
    return () => {
      disposed = true;
      permission?.removeEventListener("change", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("diewish:notification-state", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  if (!enabled || device.permission === "granted") return null;
  const message =
    device.permission === "default"
      ? "Tercihin hesabında saklanır. Bu cihazda bildirim alabilmek için önce izin vermelisin."
      : device.permission === "denied"
        ? "Bu cihazın bildirim izni kapalı. Tercihin kayıtlı olsa da izin açılana kadar bu cihazda bildirim alamazsın."
        : "Bu cihazda bildirim izni doğrulanamıyor. Tercihin hesabında saklanır; bu cihazda teslim etkinleşmiş sayılmaz.";
  const action =
    device.permission === "default" ||
    (device.platform === "native" && device.permission === "denied");
  return (
    <div
      data-notification-device-notice
      className="space-y-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground"
    >
      <p role="status">{message}</p>
      {device.platform === "web" && device.permission === "denied" && (
        <p>Tarayıcının site ayarlarından Diewish bildirimlerine izin ver.</p>
      )}
      {action && (
        <Button
          variant="outline"
          className="min-h-11 w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await requestDeviceNotificationPermission();
            } catch (failure) {
              setError(
                failure instanceof Error ? failure.message : "Bildirim izni değiştirilemedi.",
              );
            } finally {
              setDevice(notificationDeviceState());
              setBusy(false);
            }
          }}
        >
          {device.permission === "default"
            ? "Bu cihazda bildirim izni ver"
            : "Cihaz bildirim ayarlarını aç"}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
