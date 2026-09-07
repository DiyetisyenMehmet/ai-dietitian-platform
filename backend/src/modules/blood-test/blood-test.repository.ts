import type { BloodTestUpload, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";

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

  listByUser(userId: string, limit: number, cursor?: string): Promise<BloodTestUpload[]> {
    return prisma.bloodTestUpload.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  },

  findByIdForUser(id: string, userId: string): Promise<BloodTestUpload | null> {
    return prisma.bloodTestUpload.findFirst({ where: { id, userId } });
  },

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

  deleteForUser(id: string, userId: string): Promise<Prisma.BatchPayload> {
    return prisma.bloodTestUpload.deleteMany({ where: { id, userId } });
  },
};
