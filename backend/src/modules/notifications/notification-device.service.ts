import { randomUUID } from "node:crypto";

import { prisma } from "../../lib/prisma";

export interface RegisterNotificationDeviceInput {
  token: string;
  platform: "android";
  appVersion?: string;
}

interface DeviceTokenRow {
  token: string;
}

/**
 * Stores push tokens separately from notification content. Tokens are never
 * written to logs and a token can belong to only one Diewish account at a time.
 */
export const notificationDeviceService = {
  async register(userId: string, input: RegisterNotificationDeviceInput): Promise<void> {
    const id = randomUUID();
    const appVersion = input.appVersion?.trim() || null;

    await prisma.$executeRaw`
      INSERT INTO "notification_devices"
        ("id", "userId", "token", "platform", "appVersion", "enabled", "lastSeenAt", "createdAt", "updatedAt")
      VALUES
        (${id}, ${userId}, ${input.token}, ${input.platform}, ${appVersion}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("token") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "platform" = EXCLUDED."platform",
        "appVersion" = EXCLUDED."appVersion",
        "enabled" = true,
        "lastSeenAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    `;
  },

  async unregister(userId: string, token: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "notification_devices"
      SET "enabled" = false, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND "token" = ${token}
    `;
  },

  async activeTokens(userId: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<DeviceTokenRow[]>`
      SELECT "token"
      FROM "notification_devices"
      WHERE "userId" = ${userId} AND "enabled" = true
      ORDER BY "lastSeenAt" DESC
      LIMIT 10
    `;
    return rows.map((row) => row.token);
  },

  async disableToken(token: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "notification_devices"
      SET "enabled" = false, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "token" = ${token}
    `;
  },
};
