import type { Prisma, RefreshToken, User } from "@prisma/client";

import { prisma } from "../../lib/prisma";

export type RefreshRotationResult =
  | { status: "rotated"; user: User }
  | { status: "already_claimed"; record: RefreshToken }
  | { status: "invalid" };

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

  /**
   * Atomically claims a presented refresh token and creates exactly one
   * successor in the same PostgreSQL transaction. The conditional update is
   * the serialization point: concurrent requests can both read the old row,
   * but only one can change `revokedAt IS NULL` and therefore only that request
   * may insert a successor. If successor creation fails, the claim rolls back.
   */
  rotateRefreshToken(params: {
    tokenId: string;
    userId: string;
    presentedHash: string;
    now: Date;
    successor: {
      id: string;
      tokenHash: string;
      expiresAt: Date;
      userAgent?: string | null;
      ipAddress?: string | null;
    };
  }): Promise<RefreshRotationResult> {
    return prisma.$transaction(async (tx) => {
      const record = await tx.refreshToken.findUnique({ where: { id: params.tokenId } });
      if (
        !record ||
        record.userId !== params.userId ||
        record.tokenHash !== params.presentedHash ||
        record.expiresAt.getTime() <= params.now.getTime()
      ) {
        return { status: "invalid" };
      }

      if (record.revokedAt) {
        return { status: "already_claimed", record };
      }

      const user = await tx.user.findUnique({ where: { id: record.userId } });
      if (!user || !user.isActive) {
        return { status: "invalid" };
      }

      const claimed = await tx.refreshToken.updateMany({
        where: {
          id: record.id,
          userId: record.userId,
          tokenHash: params.presentedHash,
          revokedAt: null,
          expiresAt: { gt: params.now },
        },
        data: {
          revokedAt: params.now,
          replacedById: params.successor.id,
        },
      });

      if (claimed.count !== 1) {
        const current = await tx.refreshToken.findUnique({ where: { id: record.id } });
        if (current) return { status: "already_claimed", record: current };
        return { status: "invalid" };
      }

      await tx.refreshToken.create({
        data: {
          id: params.successor.id,
          userId: record.userId,
          tokenHash: params.successor.tokenHash,
          expiresAt: params.successor.expiresAt,
          userAgent: params.successor.userAgent ?? null,
          ipAddress: params.successor.ipAddress ?? null,
        },
      });

      return { status: "rotated", user };
    });
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
