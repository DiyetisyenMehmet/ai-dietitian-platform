import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { authRepository } from "../auth/auth.repository";

export const lifecycleService = {
  async deactivate(userId: string): Promise<void> {
    const user = await authRepository.findUserById(userId);
    if (!user) throw ApiError.unauthorized("Session is no longer valid.");

    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "users"
        SET "isActive" = false, "deactivatedAt" = NOW()
        WHERE "id" = ${userId}
      `,
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  },

  listSessions(userId: string) {
    return prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw ApiError.notFound("Active session not found.");
  },
};
