import { authStore } from "@/application/auth/auth-store";
import {
  mergeNotificationCenterItems,
  type NotificationCenterItem,
  type NotificationCenterNativeRecord,
} from "@/infrastructure/notifications/notification-lifecycle";
import { notificationClient } from "@/infrastructure/notifications/notification-client";

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

function nativeRecords(strict = false): NotificationCenterNativeRecord[] {
  const bridge = nativeBridge();
  if (!bridge || typeof bridge.notificationInboxJson !== "function") return [];

  try {
    const parsed = JSON.parse(bridge.notificationInboxJson());
    if (!Array.isArray(parsed)) {
      if (strict) throw new Error("Invalid native inbox.");
      return [];
    }
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
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

export interface NotificationCenterSnapshot {
  items: NotificationCenterItem[];
  unreadCount: number;
  readBefore: string | null;
  ownerId: string;
  serverSynced: boolean;
  native: NotificationCenterNativeRecord[];
}

function currentOwner(): string | null {
  const auth = authStore.getSnapshot();
  return auth.status === "authenticated" ? (auth.user?.id ?? null) : null;
}

function assertOwner(owner: string | null): asserts owner is string {
  if (!owner || currentOwner() !== owner) throw new Error("Notification account changed.");
}

const serverIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getNotificationCenterSnapshot(
  requireServer = false,
): Promise<NotificationCenterSnapshot> {
  const owner = currentOwner();
  assertOwner(owner);
  let native = nativeRecords(requireServer);
  const nativeServerIds = [
    ...new Set(
      native.flatMap((item) =>
        item.serverId && serverIdPattern.test(item.serverId) ? [item.serverId] : [],
      ),
    ),
  ].slice(0, 100);
  let server: Awaited<ReturnType<typeof notificationClient.getCenter>> | null = null;
  try {
    server = await notificationClient.getCenter(nativeServerIds);
  } catch (error) {
    assertOwner(owner);
    if (requireServer || native.length === 0) throw error;
  }
  assertOwner(owner);
  const serverRecords = server?.notifications ?? [];
  const serverById = new Map(serverRecords.map((record) => [record.id, record]));
  let serverSynced = Boolean(server);
  const uploadedReadIds = new Set<string>();

  // Upload OS tap state using the existing individual endpoint. Failed uploads
  // must not present a server-backed record as successfully read.
  await Promise.all(
    native.map(async (record) => {
      const remote = record.serverId ? serverById.get(record.serverId) : undefined;
      if (!remote || !record.readAt || remote.readAt) return;
      try {
        const result = await notificationClient.markRead(remote.id);
        assertOwner(owner);
        remote.readAt = result.notification.readAt;
        uploadedReadIds.add(remote.id);
      } catch {
        serverSynced = false;
      }
    }),
  );
  assertOwner(owner);
  // Re-read after network work so arrivals during a refresh remain visible.
  native = nativeRecords(requireServer);
  for (const record of native) {
    const remote = record.serverId ? serverById.get(record.serverId) : undefined;
    if (remote?.readAt && !record.readAt) {
      try {
        nativeBridge()?.markNotificationRead?.(record.id);
      } catch {
        if (requireServer) throw new Error("Native notification read sync failed.");
      }
    }
  }
  native = nativeRecords(requireServer);
  const canonicalNative = native.map((record) => {
    const remote = record.serverId ? serverById.get(record.serverId) : undefined;
    return remote && !remote.readAt ? { ...record, readAt: null } : record;
  });
  const items = mergeNotificationCenterItems(serverRecords, canonicalNative);
  let unreadCount = server?.unreadCount ?? 0;
  // Use the reconciled rows to account for OS taps uploaded during this read.
  unreadCount -= uploadedReadIds.size;
  for (const record of canonicalNative) {
    if ((!record.serverId || !serverById.has(record.serverId)) && !record.readAt) unreadCount += 1;
  }
  return {
    items,
    unreadCount: Math.max(0, unreadCount),
    ownerId: owner,
    readBefore: server?.readBefore ?? null,
    serverSynced,
    native,
  };
}

const bulkRequests = new Map<string, Promise<NotificationCenterSnapshot>>();

export function markAllNotificationCenterRead(
  snapshot: NotificationCenterSnapshot,
): Promise<NotificationCenterSnapshot> {
  assertOwner(snapshot.ownerId);
  const pending = bulkRequests.get(snapshot.ownerId);
  if (pending) return pending;
  const operation = (async () => {
    if (!snapshot.serverSynced || !snapshot.readBefore) throw new Error("Refresh required.");
    await notificationClient.markAllRead(snapshot.readBefore);
    assertOwner(snapshot.ownerId);
    // Only captured local-only IDs may be changed; no clear-all operation.
    for (const record of snapshot.native) {
      if (record.serverId || record.readAt) continue;
      const current = nativeRecords(true).find((item) => item.id === record.id);
      if (!current || current.occurredAt !== record.occurredAt) continue;
      nativeBridge()?.markNotificationRead?.(record.id);
    }
    const reconciled = await getNotificationCenterSnapshot(true);
    assertOwner(snapshot.ownerId);
    if (!reconciled.serverSynced) throw new Error("Notification sync incomplete.");
    for (const record of snapshot.native) {
      if (record.readAt) continue;
      const current = reconciled.native.find((item) => item.id === record.id);
      if (current && current.occurredAt === record.occurredAt && !current.readAt) {
        throw new Error("Native notification sync incomplete.");
      }
    }
    return reconciled;
  })().finally(() => {
    bulkRequests.delete(snapshot.ownerId);
  });
  bulkRequests.set(snapshot.ownerId, operation);
  return operation;
}

export async function markNotificationCenterItemRead(item: NotificationCenterItem): Promise<void> {
  const owner = currentOwner();
  assertOwner(owner);
  if (item.serverId) await notificationClient.markRead(item.serverId);
  assertOwner(owner);
  if (item.nativeId) nativeBridge()?.markNotificationRead?.(item.nativeId);
}
