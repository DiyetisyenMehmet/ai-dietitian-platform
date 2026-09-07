import type { AccountToken, AccountTokenType, User } from "@prisma/client";

import { prisma } from "../../lib/prisma";

export const accountRepository = {
  findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  async issueToken(data: {
    id: string;
    userId: string;
    type: AccountTokenType;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await prisma.$transaction([
      prisma.accountToken.updateMany({
        where: { userId: data.userId, type: data.type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.accountToken.create({
        data: {
          id: data.id,
          userId: data.userId,
          type: data.type,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      }),
    ]);
  },

  findTokenByHash(tokenHash: string, type: AccountTokenType): Promise<AccountToken | null> {
    return prisma.accountToken.findFirst({ where: { tokenHash, type } });
  },

  /** Claims only a still-unused and still-unexpired token inside the transaction. */
  consumeTokenAndVerifyEmail(
    tokenId: string,
    userId: string,
    now = new Date(),
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.accountToken.updateMany({
        where: { id: tokenId, userId, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count === 0) return false;
      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
      return true;
    });
  },

  /**
   * Atomically claims an unexpired reset token, changes the password, and
   * revokes every active refresh session. Only one concurrent consumer wins.
   */
  consumeTokenAndResetPassword(
    tokenId: string,
    userId: string,
    passwordHash: string,
    now = new Date(),
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.accountToken.updateMany({
        where: { id: tokenId, userId, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count === 0) return false;
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    });
  },

  async changePassword(userId: string, passwordHash: string): Promise<void> {
    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  },

  async requestDeletion(userId: string, requestedAt: Date): Promise<void> {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { deletionRequestedAt: requestedAt } }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: requestedAt },
      }),
    ]);
  },

  cancelDeletion(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: null },
    });
  },

  async deleteAccount(userId: string): Promise<void> {
    await prisma.user.delete({ where: { id: userId } });
  },
};
