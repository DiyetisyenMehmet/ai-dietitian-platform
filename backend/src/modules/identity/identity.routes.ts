import { Router, type RequestHandler } from "express";
import { phonePasswordController, phonePasswordMiddleware } from "./phone-password.controller";
import {
  phonePasswordStartSchema,
  phonePasswordCompleteSchema,
  phonePasswordLoginSchema,
} from "./phone-password.schemas";

import { authenticate, authenticateAny } from "../../middleware/authenticate";
import { authRateLimiter } from "../../middleware/auth-rate-limit";
import { validate } from "../../middleware/validate";
import { loginSchema } from "../auth/auth.schemas";
import { guestConversionSchema } from "./guest-conversion.schemas";
import { identityController } from "./identity.controller";
import { deactivateSchema, externalLoginSchema, sessionParamsSchema } from "./identity.schemas";

import { accountLinkController } from "./account-link.controller";
import {
  accountLinkStartSchema,
  accountLinkCompleteSchema,
  googleTransitionStartSchema,
  googleTransitionCompleteSchema,
} from "./account-link.schemas";
import { requireSafeLinking } from "./safe-linking.policy";
const safeLinkingGate: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    requireSafeLinking();
    next();
  } catch (error) {
    next(error);
  }
};

export const identityRouter = Router();

identityRouter.get("/firebase-config", identityController.firebaseConfig);

identityRouter.post(
  "/external",
  authRateLimiter,
  validate({ body: externalLoginSchema }),
  identityController.externalLogin,
);

identityRouter.post("/guest", authRateLimiter, identityController.guest);

identityRouter.post(
  "/guest/convert",
  authRateLimiter,
  authenticateAny,
  validate({ body: guestConversionSchema }),
  identityController.convertGuest,
);

identityRouter.post(
  "/reactivate",
  authRateLimiter,
  validate({ body: loginSchema }),
  identityController.reactivate,
);

identityRouter.post(
  "/deactivate",
  authRateLimiter,
  authenticate,
  validate({ body: deactivateSchema }),
  identityController.deactivate,
);

identityRouter.get("/account-methods", authenticate, identityController.accountMethods);

identityRouter.get("/sessions", authenticate, identityController.sessions);
identityRouter.delete(
  "/sessions/:id",
  authenticate,
  validate({ params: sessionParamsSchema }),
  identityController.revokeSession,
);

identityRouter.post(
  "/links/start",
  safeLinkingGate,
  authRateLimiter,
  authenticate,
  validate({ body: accountLinkStartSchema }),
  accountLinkController.start,
);
identityRouter.post(
  "/links/complete",
  safeLinkingGate,
  authRateLimiter,
  authenticate,
  validate({ body: accountLinkCompleteSchema }),
  accountLinkController.complete,
);
identityRouter.post(
  "/google-transition/start",
  safeLinkingGate,
  authRateLimiter,
  validate({ body: googleTransitionStartSchema }),
  accountLinkController.startGoogleTransition,
);
identityRouter.post(
  "/google-transition/complete",
  safeLinkingGate,
  authRateLimiter,
  validate({ body: googleTransitionCompleteSchema }),
  accountLinkController.completeGoogleTransition,
);

// A3 has its own default-off release gate, and also requires accepted A2 routing.
identityRouter.get(
  "/phone-password/status",
  phonePasswordMiddleware.headers,
  authRateLimiter,
  phonePasswordController.status,
);
identityRouter.post(
  "/phone-password/start",
  phonePasswordMiddleware.gate,
  authRateLimiter,
  phonePasswordMiddleware.optionalPrincipal,
  validate({ body: phonePasswordStartSchema }),
  phonePasswordController.start,
);
identityRouter.post(
  "/phone-password/complete",
  phonePasswordMiddleware.gate,
  authRateLimiter,
  validate({ body: phonePasswordCompleteSchema }),
  phonePasswordController.complete,
);
identityRouter.post(
  "/phone-password/cancel",
  phonePasswordMiddleware.gate,
  authRateLimiter,
  phonePasswordController.cancel,
);
identityRouter.post(
  "/phone-password/login",
  phonePasswordMiddleware.gate,
  authRateLimiter,
  validate({ body: phonePasswordLoginSchema }),
  phonePasswordController.login,
);
