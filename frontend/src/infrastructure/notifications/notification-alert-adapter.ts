import {
  ALERT_CATEGORIES,
  alertForCategory,
  type AlertCategory,
  type NotificationAlertPreference,
  type SoundPreset,
} from "@/domain/account/notification-alerts";

interface AlertBridge {
  isAvailable?(): boolean;
  notificationAlertCapabilities?(): string;
  setNotificationAlertPreferences?(json: string): boolean;
  previewNotification?(category: string, json: string): string;
  previewNotificationSound?(preset: string): boolean;
}
export interface AlertCapabilities {
  platform: "native" | "web" | "unavailable";
  customSounds: boolean;
  vibration: boolean;
  silent: boolean;
  testNotification: boolean;
}
function bridge(): AlertBridge | undefined {
  if (typeof window === "undefined") return;
  return (window as unknown as { DiewishReminders?: AlertBridge }).DiewishReminders;
}
export function isNotificationPreviewHost(host: string): boolean {
  return (
    ["localhost", "127.0.0.1", "[::1]", "staging.diewish.com"].includes(host) ||
    /^diewish-frontend-staging-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.run\.app$/.test(host)
  );
}
export function notificationAlertCapabilities(): AlertCapabilities {
  const none: AlertCapabilities = {
    platform: "unavailable",
    customSounds: false,
    vibration: false,
    silent: false,
    testNotification: false,
  };
  if (typeof window === "undefined") return none;
  try {
    const native = bridge();
    if (native?.isAvailable?.()) {
      const value = JSON.parse(native.notificationAlertCapabilities?.() ?? "{}");
      const supported =
        value.version === 1 && typeof native.setNotificationAlertPreferences === "function";
      return {
        platform: "native",
        customSounds: supported && value.customSounds === true,
        vibration: supported && value.vibration === true,
        silent: supported,
        testNotification:
          supported &&
          value.testNotification === true &&
          typeof native.previewNotification === "function" &&
          isNotificationPreviewHost(window.location.hostname),
      };
    }
  } catch {
    return none;
  }
  const supported =
    window.isSecureContext && "Notification" in window && "serviceWorker" in navigator;
  return {
    ...none,
    platform: supported ? "web" : "unavailable",
    silent: supported && "silent" in Notification.prototype,
    testNotification: supported && isNotificationPreviewHost(window.location.hostname),
  };
}
/** Refresh the device copy only after server persistence; never reschedule/cancel queues here. */
export function syncNotificationAlertPreferences(value: unknown): boolean {
  try {
    const native = bridge();
    if (!native?.isAvailable?.() || typeof native.setNotificationAlertPreferences !== "function")
      return false;
    return (
      native.setNotificationAlertPreferences(
        JSON.stringify(
          Object.fromEntries(
            ALERT_CATEGORIES.map((category) => [category, alertForCategory(value, category)]),
          ),
        ),
      ) === true
    );
  } catch {
    return false;
  }
}
let audio: HTMLAudioElement | null = null;
export async function previewNotificationSound(preset: SoundPreset): Promise<void> {
  const native = bridge();
  if (notificationAlertCapabilities().platform === "native" && native?.previewNotificationSound) {
    if (!native.previewNotificationSound(preset)) throw new Error("Ses bu cihazda çalınamadı.");
    return;
  }
  if (preset !== "diewish_drop" && preset !== "diewish_gentle")
    throw new Error("Bu ses tarayıcıda önizlenemiyor.");
  audio?.pause();
  audio = new Audio(`/audio/${preset}.wav`);
  await audio.play();
}
export function stopNotificationSoundPreview(): void {
  audio?.pause();
  audio = null;
}

export async function previewCategoryNotification(
  category: AlertCategory,
  preference: NotificationAlertPreference,
): Promise<string> {
  const caps = notificationAlertCapabilities();
  if (!caps.testNotification)
    throw new Error("Test bildirimi yalnız destekleyen test cihazlarında kullanılabilir.");
  if (caps.platform === "native") {
    const result = bridge()?.previewNotification?.(category, JSON.stringify(preference));
    if (result === "posted")
      return "Test bildirimi bu cihazda gösterildi. Sistem sessiz modu ve ses düzeyi sonucu etkileyebilir.";
    if (result === "posted_with_overrides")
      return "Test bildirimi gönderildi; cihazın bildirim veya rahatsız etmeyin ayarları seçili ses/titreşimden farklı olabilir.";
    throw new Error(
      result === "permission_denied"
        ? "Bildirim izni veya cihazın bildirim kanalı kapalı. Cihaz ayarlarını kontrol et."
        : "Test bildirimi bu cihazda gösterilemedi. Tercihlerin değiştirilmedi.",
    );
  }
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Bu tarayıcıda bildirim izni verilmedi. Tercihlerin değiştirilmedi.");
  const registration = await navigator.serviceWorker.register("/diewish-push-sw.js", {
    scope: "/",
  });
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      window.setTimeout(() => reject(new Error("Bildirim bağlantısı hazır değil.")), 8000),
    ),
  ]);
  const silent = preference.soundPreset === "silent";
  await registration.showNotification("Diewish · Test bildirimi", {
    body: "Bu cihaz için örnek bildirim. Gerçek hatırlatma kaydı oluşturulmadı.",
    tag: `diewish-preview-${category}`,
    silent,
    ...(!silent ? { vibrate: [] } : {}),
    data: { target: "/profile/notifications", preview: true },
  });
  return "Test bildirimi tarayıcıya iletildi. Özel ses ve titreşim desenleri bu tarayıcıda uygulanmaz; sistem ayarları geçerlidir.";
}
