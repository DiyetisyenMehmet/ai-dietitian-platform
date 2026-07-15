import type { Request, Response } from "express";

import type { AuditContext } from "../../lib/audit";
import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { accountService } from "./account.service";
import type {
  ChangePasswordInput,
  ConfirmPasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "./account.schemas";

/** Derives best-effort request context for audit records. */
function auditContext(req: Request): AuditContext {
  return {
    userAgent: req.headers["user-agent"] ?? null,
    ipAddress: req.ip ?? null,
  };
}

/** Returns the authenticated user id or throws a 401. */
function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return req.user.id;
}

export const accountController = {
  requestEmailVerification: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { alreadyVerified } = await accountService.requestEmailVerification(
      userId,
      auditContext(req),
    );
    sendSuccess(res, {
      message: alreadyVerified
        ? "Your email address is already verified."
        : "If your email requires verification, a verification link has been sent.",
    });
  }),

  verifyEmail: asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body as VerifyEmailInput;
    await accountService.verifyEmail(token, auditContext(req));
    sendSuccess(res, { message: "Your email address has been verified." });
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body as ForgotPasswordInput;
    await accountService.forgotPassword(email, auditContext(req));
    // Always the same response, regardless of whether the account exists.
    sendSuccess(res, {
      message: "If an account exists for that email, a password reset link has been sent.",
    });
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body as ResetPasswordInput;
    await accountService.resetPassword(token, newPassword, auditContext(req));
    sendSuccess(res, {
      message: "Your password has been reset. Please sign in with your new password.",
    });
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { currentPassword, newPassword } = req.body as ChangePasswordInput;
    await accountService.changePassword(userId, currentPassword, newPassword, auditContext(req));
    sendSuccess(res, {
      message: "Your password has been changed. Other sessions have been signed out.",
    });
  }),

  requestAccountDeletion: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { password } = req.body as ConfirmPasswordInput;
    const result = await accountService.requestAccountDeletion(userId, password, auditContext(req));
    sendSuccess(res, {
      message: "Account deletion requested. You can cancel within the grace period.",
      ...result,
    });
  }),

  cancelAccountDeletion: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    await accountService.cancelAccountDeletion(userId, auditContext(req));
    sendSuccess(res, { message: "Your account deletion request has been canceled." });
  }),

  deleteAccount: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { password } = req.body as ConfirmPasswordInput;
    await accountService.deleteAccountPermanently(userId, password, auditContext(req));
    sendSuccess(res, { message: "Your account has been permanently deleted." });
  }),
};
