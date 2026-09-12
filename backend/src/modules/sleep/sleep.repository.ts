import { randomUUID } from "node:crypto";

import { prisma } from "../../lib/prisma";

export interface SleepLogRecord {
  id: string;
  userId: string;
  sleepStart: Date;
  wakeTime: Date;
  durationMinutes: number;
  quality: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const sleepRepository = {
  async create(data: {
    userId: string;
    sleepStart: Date;
    wakeTime: Date;
    durationMinutes: number;
    quality: number;
    note?: string;
  }): Promise<SleepLogRecord> {
    const id = randomUUID();
    const rows = await prisma.$queryRaw<SleepLogRecord[]>`
      INSERT INTO "sleep_logs" ("id", "userId", "sleepStart", "wakeTime", "durationMinutes", "quality", "note")
      VALUES (${id}, ${data.userId}, ${data.sleepStart}, ${data.wakeTime}, ${data.durationMinutes}, ${data.quality}, ${data.note ?? null})
      RETURNING "id", "userId", "sleepStart", "wakeTime", "durationMinutes", "quality", "note", "createdAt", "updatedAt"
    `;
    return rows[0];
  },

  async findById(userId: string, id: string): Promise<SleepLogRecord | null> {
    const rows = await prisma.$queryRaw<SleepLogRecord[]>`
      SELECT "id", "userId", "sleepStart", "wakeTime", "durationMinutes", "quality", "note", "createdAt", "updatedAt"
      FROM "sleep_logs"
      WHERE "id" = ${id} AND "userId" = ${userId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  },

  async list(userId: string, since?: Date): Promise<SleepLogRecord[]> {
    if (since) {
      return prisma.$queryRaw<SleepLogRecord[]>`
        SELECT "id", "userId", "sleepStart", "wakeTime", "durationMinutes", "quality", "note", "createdAt", "updatedAt"
        FROM "sleep_logs"
        WHERE "userId" = ${userId} AND "wakeTime" >= ${since}
        ORDER BY "wakeTime" DESC, "id" DESC
      `;
    }
    return prisma.$queryRaw<SleepLogRecord[]>`
      SELECT "id", "userId", "sleepStart", "wakeTime", "durationMinutes", "quality", "note", "createdAt", "updatedAt"
      FROM "sleep_logs"
      WHERE "userId" = ${userId}
      ORDER BY "wakeTime" DESC, "id" DESC
      LIMIT 90
    `;
  },

  listRange(userId: string, from: Date, to: Date): Promise<SleepLogRecord[]> {
    return prisma.$queryRaw<SleepLogRecord[]>`
      SELECT "id", "userId", "sleepStart", "wakeTime", "durationMinutes", "quality", "note", "createdAt", "updatedAt"
      FROM "sleep_logs"
      WHERE "userId" = ${userId} AND "wakeTime" >= ${from} AND "wakeTime" < ${to}
      ORDER BY "wakeTime" ASC, "id" ASC
    `;
  },

  async update(data: {
    id: string;
    userId: string;
    sleepStart: Date;
    wakeTime: Date;
    durationMinutes: number;
    quality: number;
    note?: string;
  }): Promise<SleepLogRecord | null> {
    const rows = await prisma.$queryRaw<SleepLogRecord[]>`
      UPDATE "sleep_logs"
      SET "sleepStart" = ${data.sleepStart},
          "wakeTime" = ${data.wakeTime},
          "durationMinutes" = ${data.durationMinutes},
          "quality" = ${data.quality},
          "note" = ${data.note ?? null},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${data.id} AND "userId" = ${data.userId}
      RETURNING "id", "userId", "sleepStart", "wakeTime", "durationMinutes", "quality", "note", "createdAt", "updatedAt"
    `;
    return rows[0] ?? null;
  },

  async remove(userId: string, id: string): Promise<void> {
    await prisma.$executeRaw`
      DELETE FROM "sleep_logs" WHERE "id" = ${id} AND "userId" = ${userId}
    `;
  },
};
