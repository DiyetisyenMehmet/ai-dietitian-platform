import type { AccountToken, AccountTokenType, User } from "@prisma/client";

import { prisma } from "../../lib/prisma";

/**
 * Data-access layer for the account-lifecycle module. All Prisma queries for
 * account tokens and lifecycle-related user mutations live here so the service
 * stays persistence-agnostic. Multi-step mutations that must be atomic are
 * wrapped in `$transaction`.
 */
export const accountRepository = {
  findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  /**
   * Issues a new single-use token, atomically invalidating any still-valid
   * tokens of the same type for the user (only the newest link should work).
   */
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

  /** Looks up a token by its hash and type (validity is checked in the service). */
  findTokenByHash(tokenHash: string, type: AccountTokenType): Promise<AccountToken | null> {
    return prisma.accountToken.findFirst({ where: { tokenHash, type } });
  },

  /**
   * Atomically consumes a verification token and stamps the user's email as
   * verified. The token is claimed with a guarded `usedAt: null` update *first*;
   * if zero rows match (already used / raced), no further work runs and `false`
   * is returned — making one-time usage race-safe rather than reliant on a
   * separate pre-check. Returns `true` when the token was successfully consumed.
   */
  consumeTokenAndVerifyEmail(tokenId: string, userId: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.accountToken.updateMany({
        where: { id: tokenId, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) return false;
      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
      return true;
    });
  },

  /**
   * Atomically consumes a reset token, updates the password hash, and revokes
   * every active refresh token. The token is claimed with a guarded
   * `usedAt: null` update first (race-safe one-time usage); if it was already
   * used, nothing else runs and `false` is returned. Revoking sessions on reset
   * is a standard measure (a reset implies possible compromise).
   */
  consumeTokenAndResetPassword(
    tokenId: string,
    userId: string,
    passwordHash: string,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.accountToken.updateMany({
        where: { id: tokenId, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) return false;
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return true;
    });
  },

  /**
   * Updates the password hash and revokes all active refresh tokens so other
   * sessions are logged out after a deliberate password change.
   */
  async changePassword(userId: string, passwordHash: string): Promise<void> {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  },

  /**
   * Flags the account for deletion (grace period starts) and revokes active
   * sessions so the pending-deletion account cannot keep being used.
   */
  async requestDeletion(userId: string, requestedAt: Date): Promise<void> {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { deletionRequestedAt: requestedAt } }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  },

  /** Clears a pending deletion request. */
  cancelDeletion(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: null },
    });
  },

  /**
   * Permanently deletes the account. Related profile, refresh tokens and
   * account tokens are removed via `onDelete: Cascade`; audit logs intentionally
   * survive (no FK relation).
   */
  async deleteAccount(userId: string): Promise<void> {
    await prisma.user.delete({ where: { id: userId } });
  },
};
