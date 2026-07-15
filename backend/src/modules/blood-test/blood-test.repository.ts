import type { BloodTestUpload, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";

/**
 * Data-access layer for blood-test uploads. All queries are owner-scoped by
 * `userId` at this layer so a caller can never accidentally read or mutate
 * another user's record.
 */
export const bloodTestRepository = {
  create(data: {
    userId: string;
    storageProvider: string;
    storageKey: string;
    originalFilename: string;
    mimeType: string;
    fileSizeBytes: number;
    checksumSha256: string;
    label?: string | null;
    testDate?: Date | null;
  }): Promise<BloodTestUpload> {
    return prisma.bloodTestUpload.create({ data });
  },

  /** Lists a user's uploads, newest first. */
  listByUser(userId: string): Promise<BloodTestUpload[]> {
    return prisma.bloodTestUpload.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Fetches a single upload scoped to its owner (null if not owned/found). */
  findByIdForUser(id: string, userId: string): Promise<BloodTestUpload | null> {
    return prisma.bloodTestUpload.findFirst({ where: { id, userId } });
  },

  /** Replaces the stored-file fields of an existing upload (owner-scoped). */
  updateFile(
    id: string,
    userId: string,
    data: {
      storageProvider: string;
      storageKey: string;
      originalFilename: string;
      mimeType: string;
      fileSizeBytes: number;
      checksumSha256: string;
    },
  ): Promise<Prisma.BatchPayload> {
    return prisma.bloodTestUpload.updateMany({ where: { id, userId }, data });
  },

  /** Deletes an upload record (owner-scoped). */
  deleteForUser(id: string, userId: string): Promise<Prisma.BatchPayload> {
    return prisma.bloodTestUpload.deleteMany({ where: { id, userId } });
  },
};
