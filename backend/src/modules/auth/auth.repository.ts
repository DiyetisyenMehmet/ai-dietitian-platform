import type { Prisma, RefreshToken, User } from "@prisma/client";

import { prisma } from "../../lib/prisma";

/**
 * Data-access layer for the auth module. Keeps all Prisma queries in one place
 * so the service layer stays persistence-agnostic and easily testable.
 */
export const authRepository = {
  findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  createUser(data: {
    email: string;
    passwordHash: string;
    fullName?: string;
  }): Promise<User> {
    return prisma.user.create({ data });
  },

  updateLastLogin(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  },

  createRefreshToken(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<RefreshToken> {
    return prisma.refreshToken.create({ data });
  },

  findRefreshTokenById(id: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({ where: { id } });
  },

  /** Marks a single token revoked and records its successor (rotation lineage). */
  revokeRefreshToken(id: string, replacedById?: string): Promise<Prisma.BatchPayload> {
    return prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: replacedById ?? null },
    });
  },

  /** Revokes every active token for a user (used on reuse detection / logout-all). */
  revokeAllForUser(userId: string): Promise<Prisma.BatchPayload> {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
