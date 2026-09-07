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

export const accountRouter = Router();

accountRouter.post(
  "/email/verify/request",
  authRateLimiter,
  authenticate,
  accountController.requestEmailVerification,
);
accountRouter.post(
  "/email/verify/confirm",
  authRateLimiter,
  validate({ body: verifyEmailSchema }),
  accountController.verifyEmail,
);
accountRouter.post(
  "/password/forgot",
  authRateLimiter,
  validate({ body: forgotPasswordSchema }),
  accountController.forgotPassword,
);
accountRouter.post(
  "/password/reset",
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  accountController.resetPassword,
);
accountRouter.post(
  "/password/change",
  authenticate,
  validate({ body: changePasswordSchema }),
  accountController.changePassword,
);

/** Starts the V1 grace-period deletion lifecycle and revokes active sessions. */
accountRouter.post(
  "/deletion/request",
  authenticate,
  validate({ body: confirmPasswordSchema }),
  accountController.requestAccountDeletion,
);
accountRouter.post("/deletion/cancel", authenticate, accountController.cancelAccountDeletion);

/**
 * Permanently purges only an account whose deletion request has completed the
 * configured grace period. This endpoint no longer provides an immediate-delete
 * bypass.
 */
accountRouter.delete(
  "/",
  authenticate,
  validate({ body: confirmPasswordSchema }),
  accountController.deleteAccount,
);
