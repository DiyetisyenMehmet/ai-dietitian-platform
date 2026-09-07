import crypto from "node:crypto";

import { AccountTokenType, type AccountToken } from "@prisma/client";

import { env } from "../../config/env";
import { recordAudit, type AuditContext } from "../../lib/audit";
import { logger } from "../../lib/logger";
import { mailer } from "../../lib/mailer";
import { ApiError } from "../../utils/api-error";
import { generateOpaqueToken, hashToken } from "../../utils/jwt";
import { hashPassword, verifyPassword } from "../../utils/password";
import { accountRepository } from "./account.repository";

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function invalidTokenError(): ApiError {
  return new ApiError(400, "This link is invalid or has expired.", { code: "TOKEN_INVALID" });
}

function assertTokenUsable(token: AccountToken | null): asserts token is AccountToken {
  if (!token || token.usedAt !== null || token.expiresAt.getTime() <= Date.now()) {
    throw invalidTokenError();
  }
}

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

export const accountService = {
  async requestEmailVerification(
    userId: string,
    context: AuditContext,
  ): Promise<{ alreadyVerified: boolean }> {
    const user = await accountRepository.findUserById(userId);
    if (!user) throw ApiError.unauthorized("Session is no longer valid.");
    if (user.emailVerifiedAt) return { alreadyVerified: true };

    const rawToken = await issueToken(
      user.id,
      AccountTokenType.EMAIL_VERIFICATION,
      env.EMAIL_VERIFICATION_TTL_HOURS * MS_PER_HOUR,
    );
    await mailer.sendEmailVerification(user.email, rawToken);
    await recordAudit({ action: "EMAIL_VERIFICATION_REQUESTED", userId: user.id, context });
    return { alreadyVerified: false };
  },

  async verifyEmail(rawToken: string, context: AuditContext): Promise<void> {
    const token = await accountRepository.findTokenByHash(
      hashToken(rawToken),
      AccountTokenType.EMAIL_VERIFICATION,
    );
    assertTokenUsable(token);

    const consumed = await accountRepository.consumeTokenAndVerifyEmail(token.id, token.userId);
    if (!consumed) throw invalidTokenError();
    await recordAudit({ action: "EMAIL_VERIFIED", userId: token.userId, context });
  },

  async forgotPassword(email: string, context: AuditContext): Promise<void> {
    const user = await accountRepository.findUserByEmail(email);
    if (!user || !user.isActive) {
      logger.info("Password reset requested for unknown/inactive account (no-op)");
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
    if (!consumed) throw invalidTokenError();
    await recordAudit({ action: "PASSWORD_RESET_COMPLETED", userId: token.userId, context });
  },

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context: AuditContext,
  ): Promise<void> {
    const user = await accountRepository.findUserById(userId);
    if (!user) throw ApiError.unauthorized("Session is no longer valid.");

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw ApiError.unauthorized("Current password is incorrect.");

    const passwordHash = await hashPassword(newPassword);
    await accountRepository.changePassword(user.id, passwordHash);
    await recordAudit({ action: "PASSWORD_CHANGED", userId: user.id, context });
  },

  async requestAccountDeletion(
    userId: string,
    password: string,
    context: AuditContext,
  ): Promise<{ deletionRequestedAt: string; purgeEligibleAt: string; graceDays: number }> {
    const user = await accountRepository.findUserById(userId);
    if (!user) throw ApiError.unauthorized("Session is no longer valid.");

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw ApiError.unauthorized("Password is incorrect.");

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

  async cancelAccountDeletion(userId: string, context: AuditContext): Promise<void> {
    const user = await accountRepository.findUserById(userId);
    if (!user) throw ApiError.unauthorized("Session is no longer valid.");
    if (!user.deletionRequestedAt) {
      throw ApiError.badRequest("There is no pending deletion request to cancel.");
    }

    await accountRepository.cancelDeletion(user.id);
    await recordAudit({ action: "ACCOUNT_DELETION_CANCELED", userId: user.id, context });
  },

  /**
   * V1 deletion model: request -> grace period -> permanent purge. The legacy
   * DELETE endpoint can no longer bypass the grace period.
   */
  async deleteAccountPermanently(
    userId: string,
    password: string,
    context: AuditContext,
  ): Promise<void> {
    const user = await accountRepository.findUserById(userId);
    if (!user) throw ApiError.unauthorized("Session is no longer valid.");

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw ApiError.unauthorized("Password is incorrect.");

    if (!user.deletionRequestedAt) {
      throw ApiError.badRequest("Account deletion must be requested before permanent deletion.");
    }

    const eligibleAt =
      user.deletionRequestedAt.getTime() + env.ACCOUNT_DELETION_GRACE_DAYS * MS_PER_DAY;
    if (Date.now() < eligibleAt) {
      throw ApiError.conflict("Account deletion grace period has not elapsed yet.", {
        purgeEligibleAt: new Date(eligibleAt).toISOString(),
      });
    }

    // No email or other directly identifying metadata is retained in the audit record.
    await recordAudit({ action: "ACCOUNT_DELETED", userId: user.id, context });
    await accountRepository.deleteAccount(user.id);
    logger.info({ userId: user.id }, "Account permanently deleted after grace period");
  },
};
