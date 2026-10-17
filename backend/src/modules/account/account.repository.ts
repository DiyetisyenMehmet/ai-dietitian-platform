import type { AccountToken, AccountTokenType, User } from "@prisma/client";

import { prisma } from "../../lib/prisma";

export interface AccountStorageRef {
  storageProvider: string;
  storageKey: string;
}

/**
 * Data-access layer for the account-lifecycle module. All Prisma queries for
 * account tokens and lifecycle-related user mutations live here so the service
 * stays persistence-agnostic. Multi-step mutations that must be atomic are
 * wrapped in `$transaction`.
 */
export const accountRepository = {
  getMascotPreferences(userId: string) {
    return prisma.dashboardCardPreference.findUnique({
      where: { userId },
      select: { mascotId: true, mascotAnimation: true },
    });
  },

  upsertMascotPreferences(userId: string, input: { mascotId?: "classic" | "mirmir"; animationEnabled?: boolean }) {
    const data = {
      ...(input.mascotId !== undefined ? { mascotId: input.mascotId } : {}),
      ...(input.animationEnabled !== undefined ? { mascotAnimation: input.animationEnabled } : {}),
    };
    return prisma.dashboardCardPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      select: { mascotId: true, mascotAnimation: true },
    });
  },

  findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  getDashboardCardPreference(userId: string) {
    return prisma.dashboardCardPreference.findUnique({
      where: { userId },
      select: {
        cardOrder: true,
        hiddenCardIds: true,
        quickActionOrder: true,
        hiddenQuickActionIds: true,
      },
    });
  },

  upsertDashboardCardPreference(
    userId: string,
    input: {
      order: string[];
      hidden: string[];
      quickActionOrder?: string[];
      hiddenQuickActionIds?: string[];
    },
  ) {
    return prisma.dashboardCardPreference.upsert({
      where: { userId },
      create: {
        userId,
        cardOrder: input.order,
        hiddenCardIds: input.hidden,
        quickActionOrder: input.quickActionOrder ?? [],
        hiddenQuickActionIds: input.hiddenQuickActionIds ?? [],
      },
      update: {
        cardOrder: input.order,
        hiddenCardIds: input.hidden,
        ...(input.quickActionOrder !== undefined
          ? { quickActionOrder: input.quickActionOrder }
          : {}),
        ...(input.hiddenQuickActionIds !== undefined
          ? { hiddenQuickActionIds: input.hiddenQuickActionIds }
          : {}),
      },
      select: {
        cardOrder: true,
        hiddenCardIds: true,
        quickActionOrder: true,
        hiddenQuickActionIds: true,
      },
    });
  },

  /**
   * Returns every externally stored blood-test object owned by the user. These
   * references must be removed before the account row is deleted, because the
   * database cascade cannot delete binaries living outside PostgreSQL.
   */
  listBloodTestStorageRefs(userId: string): Promise<AccountStorageRef[]> {
    return prisma.bloodTestUpload.findMany({
      where: { userId },
      select: { storageProvider: true, storageKey: true },
      orderBy: { createdAt: "asc" },
    });
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
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${data.userId} FOR UPDATE`;
      await tx.accountToken.updateMany({
        where: { userId: data.userId, type: data.type, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.accountToken.create({
        data: {
          id: data.id,
          userId: data.userId,
          type: data.type,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      });
    });
  },

  /** Cross-instance cooldown, including requests via both public route aliases. */
  async enqueuePasswordReset(userId: string): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO "password_reset_deliveries" ("userId", "requestedAt")
      VALUES (${userId}, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId") DO UPDATE SET
        "requestedAt" = CURRENT_TIMESTAMP, "attemptedAt" = NULL,
        "completedAt" = NULL, "attempts" = 0, "leaseId" = NULL, "leaseUntil" = NULL
      WHERE "password_reset_deliveries"."requestedAt" < CURRENT_TIMESTAMP - INTERVAL '10 minutes'
        AND ("password_reset_deliveries"."leaseUntil" IS NULL OR "password_reset_deliveries"."leaseUntil" < CURRENT_TIMESTAMP)
    `;
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
  consumeTokenAndResetPassword(tokenId: string, userId: string, passwordHash: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      // Serialize against issuance and concurrent completions. Recheck expiry AFTER hashing/lock.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user?.isActive || user.role !== "USER" || user.deletionRequestedAt ||
          user.email.endsWith(".diewish.invalid")) return false;
      const now = new Date();
      const claimed = await tx.accountToken.updateMany({
        where: { id: tokenId, userId, type: "PASSWORD_RESET", usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;
      await tx.user.update({ where: { id: userId }, data: { passwordHash, authVersion: { increment: 1 } } });
      await tx.accountToken.updateMany({ where: { userId, type: "PASSWORD_RESET", usedAt: null }, data: { usedAt: now } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      await tx.passwordResetDelivery.updateMany({ where: { userId }, data: { completedAt: now } });
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
   * Permanently deletes the account and writes the surviving deletion audit in
   * the same database transaction. External objects must be removed first.
   */
  async deleteAccountWithAudit(
    userId: string,
    input: {
      ipAddress: string | null;
      userAgent: string | null;
      externalHealthObjectsDeleted: number;
    },
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_DELETED",
          userId,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: {
            externalHealthObjectsDeleted: input.externalHealthObjectsDeleted,
          },
        },
      });
      await tx.user.delete({ where: { id: userId } });
    });
  },
};
