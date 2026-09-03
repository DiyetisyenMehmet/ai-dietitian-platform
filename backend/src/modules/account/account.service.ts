import crypto from "node:crypto";

import { AccountTokenType, type AccountToken } from "@prisma/client";

import { env } from "../../config/env";
import { recordAudit, type AuditContext } from "../../lib/audit";
import { logger } from "../../lib/logger";
import { mailer } from "../../lib/mailer";
import { getStorageProviderByName } from "../../lib/storage";
import { ApiError } from "../../utils/api-error";
import { generateOpaqueToken, hashToken } from "../../utils/jwt";
import { hashPassword, verifyPassword } from "../../utils/password";
import { accountRepository } from "./account.repository";

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Generic, non-leaking error for any invalid/expired/used single-use token. */
function invalidTokenError(): ApiError {
  return new ApiError(400, "This link is invalid or has expired.", { code: "TOKEN_INVALID" });
}

/**
 * Validates a looked-up token: it must exist, be unused, and be unexpired.
 * A single generic failure keeps an attacker from distinguishing the reasons.
 */
function assertTokenUsable(token: AccountToken | null): asserts token is AccountToken {
  if (!token || token.usedAt !== null || token.expiresAt.getTime() <= Date.now()) {
    throw invalidTokenError();
  }
}

/** Issues a single-use token of the given type and returns the raw token string. */
async function issueToken(
  userId: string,
  type: AccountTokenType,
  ttlMs: number,
): Promise<string> {
  const rawToken = generateOpaqueToken();
  await accountRepository.issueToken({
    id: crypto.randomUUID(),
    userId,
    type,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return rawToken;
}

function bloodTestStorageNamespace(userId: string): string {
  return `blood-tests/${userId}`;
}

export const accountService = {
  /**
   * Issues (and "sends") an email-verification link for the authenticated user.
   * Idempotent when already verified — no token is issued in that case.
   */
  async requestEmailVerification(
    userId: string,
    context: AuditContext,
  ): Promise<{ alreadyVerified: boolean }> {
    const user = await accountRepository.findUserById(userId);
    if (!user) {
      throw ApiError.unauthorized("Session is no longer valid.");
    }
    if (user.emailVerifiedAt) {
      return { alreadyVerified: true };
    }

    const rawToken = await issueToken(
      user.id,
      AccountTokenType.EMAIL_VERIFICATION,
      env.EMAIL_VERIFICATION_TTL_HOURS * MS_PER_HOUR,
    );
    await mailer.sendEmailVerification(user.email, rawToken);
    await recordAudit({ action: "EMAIL_VERIFICATION_REQUESTED", userId: user.id, context });

    return { alreadyVerified: false };
  },

  /** Confirms an email address from a verification token (single-use). */
  async verifyEmail(rawToken: string, context: AuditContext): Promise<void> {
    const token = await accountRepository.findTokenByHash(
      hashToken(rawToken),
      AccountTokenType.EMAIL_VERIFICATION,
    );
    assertTokenUsable(token);

    const consumed = await accountRepository.consumeTokenAndVerifyEmail(token.id, token.userId);
    if (!consumed) {
      throw invalidTokenError();
    }
    await recordAudit({ action: "EMAIL_VERIFIED", userId: token.userId, context });
  },

  /**
   * Starts a password-reset flow. Always resolves successfully regardless of
   * whether the email exists, to avoid account-enumeration. A token is only
   * issued/sent for an existing, active account.
   */
  async forgotPassword(email: string, context: AuditContext): Promise<void> {
    const user = await accountRepository.findUserByEmail(email);
    if (!user || !user.isActive) {
      logger.info({ email }, "Password reset requested for unknown/inactive account (no-op)");
      return;
    }

    const rawToken = await issueToken(
      user.id,
      AccountTokenType.PASSWORD_RESET,
      env.PASSWORD_RESET_TTL_MINUTES * MS_PER_MINUTE,
    );
    await mailer.sendPasswordReset(user.email, rawToken);
    await recordAudit({ action: "PASSWORD_RESET_REQUESTED", userId: user.id, context });
  },

  /** Completes a password reset with a valid token; revokes all sessions. */
  async resetPassword(rawToken: string, newPassword: string, context: AuditContext): Promise<void> {
    const token = await accountRepository.findTokenByHash(
      hashToken(rawToken),
      AccountTokenType.PASSWORD_RESET,
    );
    assertTokenUsable(token);

    const passwordHash = await hashPassword(newPassword);
    const consumed = await accountRepository.consumeTokenAndResetPassword(
      token.id,
      token.userId,
      passwordHash,
    );
    if (!consumed) {
      throw invalidTokenError();
    }
    await recordAudit({ action: "PASSWORD_RESET_COMPLETED", userId: token.userId, context });
  },

  /**
   * Changes an authenticated user's password after verifying the current one.
   * Other sessions are revoked so a change propagates as a forced re-login.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context: AuditContext,
  ): Promise<void> {
    const user = await accountRepository.findUserById(userId);
    if (!user) {
      throw ApiError.unauthorized("Session is no longer valid.");
    }

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      throw ApiError.unauthorized("Current password is incorrect.");
    }

    const passwordHash = await hashPassword(newPassword);
    await accountRepository.changePassword(user.id, passwordHash);
    await recordAudit({ action: "PASSWORD_CHANGED", userId: user.id, context });
  },

  /**
   * Requests account deletion after re-authenticating with the password. The
   * account enters a grace period; sessions are revoked. Returns the request
   * timestamp and the date it becomes eligible for permanent purge.
   */
  async requestAccountDeletion(
    userId: string,
    password: string,
    context: AuditContext,
  ): Promise<{ deletionRequestedAt: string; purgeEligibleAt: string; graceDays: number }> {
    const user = await accountRepository.findUserById(userId);
    if (!user) {
      throw ApiError.unauthorized("Session is no longer valid.");
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      throw ApiError.unauthorized("Password is incorrect.");
    }

    const requestedAt = new Date();
    await accountRepository.requestDeletion(user.id, requestedAt);
    await recordAudit({ action: "ACCOUNT_DELETION_REQUESTED", userId: user.id, context });

    const purgeEligibleAt = new Date(
      requestedAt.getTime() + env.ACCOUNT_DELETION_GRACE_DAYS * MS_PER_DAY,
    );
    return {
      deletionRequestedAt: requestedAt.toISOString(),
      purgeEligibleAt: purgeEligibleAt.toISOString(),
      graceDays: env.ACCOUNT_DELETION_GRACE_DAYS,
    };
  },

  /** Cancels a pending account-deletion request within the grace period. */
  async cancelAccountDeletion(userId: string, context: AuditContext): Promise<void> {
    const user = await accountRepository.findUserById(userId);
    if (!user) {
      throw ApiError.unauthorized("Session is no longer valid.");
    }
    if (!user.deletionRequestedAt) {
      throw ApiError.badRequest("There is no pending deletion request to cancel.");
    }

    await accountRepository.cancelDeletion(user.id);
    await recordAudit({ action: "ACCOUNT_DELETION_CANCELED", userId: user.id, context });
  },

  /**
   * Permanently and irreversibly deletes the account after re-authenticating
   * with the password. External health-document binaries are deleted BEFORE the
   * database cascade. If object deletion fails, the database references are
   * deliberately retained so cleanup can be retried instead of silently
   * orphaning health data in storage.
   */
  async deleteAccountPermanently(
    userId: string,
    password: string,
    context: AuditContext,
  ): Promise<void> {
    const user = await accountRepository.findUserById(userId);
    if (!user) {
      throw ApiError.unauthorized("Session is no longer valid.");
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      throw ApiError.unauthorized("Password is incorrect.");
    }

    const storageRefs = await accountRepository.listBloodTestStorageRefs(user.id);
    try {
      for (const ref of storageRefs) {
        const storage = getStorageProviderByName(ref.storageProvider);
        await storage.delete({
          namespace: bloodTestStorageNamespace(user.id),
          key: ref.storageKey,
        });
      }
    } catch (error) {
      logger.error(
        { err: error, userId: user.id, storageObjectCount: storageRefs.length },
        "Permanent account deletion blocked because external health data could not be removed",
      );
      throw new ApiError(503, "Account deletion could not be completed safely. Please try again later.", {
        code: "ACCOUNT_STORAGE_CLEANUP_FAILED",
      });
    }

    // Keep the surviving audit record data-minimal: userId is sufficient for
    // reconciliation. Do not retain the deleted account's email in metadata.
    await recordAudit({
      action: "ACCOUNT_DELETED",
      userId: user.id,
      context,
      metadata: { externalHealthObjectsDeleted: storageRefs.length },
    });
    await accountRepository.deleteAccount(user.id);
    logger.info(
      { userId: user.id, externalHealthObjectsDeleted: storageRefs.length },
      "Account permanently deleted",
    );
  },
};
