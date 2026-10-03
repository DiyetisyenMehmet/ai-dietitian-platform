import {
  mergeNotificationCenterItems,
  type NotificationCenterItem,
  type NotificationCenterNativeRecord,
} from "@/infrastructure/notifications/notification-lifecycle";
import {
  notificationClient,
  type NotificationCenterApiItem,
} from "@/infrastructure/notifications/notification-client";

interface NativeNotificationCenterBridge {
  notificationInboxJson?(): string;
  markNotificationRead?(id: string): void;
}

function nativeBridge(): NativeNotificationCenterBridge | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return (
      window as typeof window & {
        DiewishReminders?: NativeNotificationCenterBridge;
      }
    ).DiewishReminders;
  } catch {
    return undefined;
  }
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nativeRecords(): NotificationCenterNativeRecord[] {
  const bridge = nativeBridge();
  if (!bridge || typeof bridge.notificationInboxJson !== "function") return [];

  try {
    const parsed = JSON.parse(bridge.notificationInboxJson());
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): NotificationCenterNativeRecord[] => {
      if (!value || typeof value !== "object") return [];
      const record = value as Record<string, unknown>;
      const id = cleanText(record.id, 160);
      const title = cleanText(record.title, 120);
      const body = cleanText(record.body, 500);
      const target = cleanText(record.target, 160);
      const occurredAt = Number(record.occurredAt);
      if (!id || !title || !body || !target || !Number.isFinite(occurredAt)) return [];
      const readAt = record.readAt == null ? null : Number(record.readAt);
      return [
        {
          id,
          serverId: cleanText(record.serverId, 120) || null,
          title,
          body,
          target,
          occurredAt,
          readAt: Number.isFinite(readAt) ? readAt : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

export interface NotificationCenterSnapshot {
  items: NotificationCenterItem[];
  unreadCount: number;
}

export async function getNotificationCenterSnapshot(): Promise<NotificationCenterSnapshot> {
  const native = nativeRecords();
  let server: { notifications: NotificationCenterApiItem[]; unreadCount: number } | null = null;

  try {
    server = await notificationClient.getCenter();
  } catch (error) {
    if (native.length === 0) throw error;
  }

  const serverRecords = server?.notifications ?? [];
  const items = mergeNotificationCenterItems(serverRecords, native);
  const serverById = new Map(serverRecords.map((record) => [record.id, record]));
  let unreadCount = server?.unreadCount ?? 0;

  for (const record of native) {
    const remote = record.serverId ? serverById.get(record.serverId) : undefined;
    if (!remote) {
      if (!record.readAt) unreadCount += 1;
      continue;
    }
    if (record.readAt && !remote.readAt) {
      unreadCount = Math.max(0, unreadCount - 1);
      void notificationClient.markRead(remote.id).catch(() => undefined);
    }
  }

  return { items, unreadCount };
}

export async function markNotificationCenterItemRead(item: NotificationCenterItem): Promise<void> {
  if (item.nativeId) {
    try {
      nativeBridge()?.markNotificationRead?.(item.nativeId);
    } catch {
      // Native state is supplementary; server read state can still proceed.
    }
  }
  if (item.serverId) await notificationClient.markRead(item.serverId);
}
