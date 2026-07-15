import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { authRateLimiter } from "../../middleware/auth-rate-limit";
import { validate } from "../../middleware/validate";
import { accountController } from "./account.controller";
import {
  changePasswordSchema,
  confirmPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./account.schemas";

/**
 * Account-lifecycle router (mounted at /api/account).
 *
 * Unauthenticated, abuse-prone endpoints (email verification confirm, forgot
 * password, reset password) sit behind the stricter `authRateLimiter`. The
 * authenticated email-verification *request* is also rate-limited because it
 * triggers outbound email. Destructive actions require re-authentication with
 * the account password (validated in the service).
 */
export const accountRouter = Router();

/**
 * @openapi
 * /api/account/email/verify/request:
 *   post:
 *     tags: [Account]
 *     summary: Send an email-verification link to the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Verification link sent (or email already verified). }
 *       401: { description: Missing or invalid access token. }
 *       429: { description: Too many requests. }
 */
accountRouter.post(
  "/email/verify/request",
  authRateLimiter,
  authenticate,
  accountController.requestEmailVerification,
);

/**
 * @openapi
 * /api/account/email/verify/confirm:
 *   post:
 *     tags: [Account]
 *     summary: Confirm an email address with a verification token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200: { description: Email verified. }
 *       400: { description: Invalid or expired token. }
 *       422: { description: Validation failed. }
 */
accountRouter.post(
  "/email/verify/confirm",
  authRateLimiter,
  validate({ body: verifyEmailSchema }),
  accountController.verifyEmail,
);

/**
 * @openapi
 * /api/account/password/forgot:
 *   post:
 *     tags: [Account]
 *     summary: Request a password-reset link
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Always returns success to prevent account enumeration. }
 *       422: { description: Validation failed. }
 */
accountRouter.post(
  "/password/forgot",
  authRateLimiter,
  validate({ body: forgotPasswordSchema }),
  accountController.forgotPassword,
);

/**
 * @openapi
 * /api/account/password/reset:
 *   post:
 *     tags: [Account]
 *     summary: Reset a password using a reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Password reset; all sessions revoked. }
 *       400: { description: Invalid or expired token. }
 *       422: { description: Validation failed. }
 */
accountRouter.post(
  "/password/reset",
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  accountController.resetPassword,
);

/**
 * @openapi
 * /api/account/password/change:
 *   post:
 *     tags: [Account]
 *     summary: Change the password of the authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Password changed; other sessions revoked. }
 *       401: { description: Not authenticated or current password incorrect. }
 *       422: { description: Validation failed. }
 */
accountRouter.post(
  "/password/change",
  authenticate,
  validate({ body: changePasswordSchema }),
  accountController.changePassword,
);

/**
 * @openapi
 * /api/account/deletion/request:
 *   post:
 *     tags: [Account]
 *     summary: Request account deletion (starts the grace period)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string }
 *     responses:
 *       200: { description: Deletion requested; returns grace-period details. }
 *       401: { description: Not authenticated or password incorrect. }
 *       422: { description: Validation failed. }
 */
accountRouter.post(
  "/deletion/request",
  authenticate,
  validate({ body: confirmPasswordSchema }),
  accountController.requestAccountDeletion,
);

/**
 * @openapi
 * /api/account/deletion/cancel:
 *   post:
 *     tags: [Account]
 *     summary: Cancel a pending account-deletion request
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Pending deletion request canceled. }
 *       400: { description: No pending deletion request. }
 *       401: { description: Not authenticated. }
 */
accountRouter.post("/deletion/cancel", authenticate, accountController.cancelAccountDeletion);

/**
 * @openapi
 * /api/account:
 *   delete:
 *     tags: [Account]
 *     summary: Permanently delete the authenticated user's account
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string }
 *     responses:
 *       200: { description: Account permanently deleted. }
 *       401: { description: Not authenticated or password incorrect. }
 *       422: { description: Validation failed. }
 */
accountRouter.delete(
  "/",
  authenticate,
  validate({ body: confirmPasswordSchema }),
  accountController.deleteAccount,
);
