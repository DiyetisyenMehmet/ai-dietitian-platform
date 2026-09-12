import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { authRateLimiter } from "../../middleware/auth-rate-limit";
import { validate } from "../../middleware/validate";
import { loginSchema } from "../auth/auth.schemas";
import { identityController } from "./identity.controller";
import { deactivateSchema, externalLoginSchema, sessionParamsSchema } from "./identity.schemas";

export const identityRouter = Router();

identityRouter.post(
  "/external",
  authRateLimiter,
  validate({ body: externalLoginSchema }),
  identityController.externalLogin,
);

identityRouter.post("/guest", authRateLimiter, identityController.guest);

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

identityRouter.get("/sessions", authenticate, identityController.sessions);
identityRouter.delete(
  "/sessions/:id",
  authenticate,
  validate({ params: sessionParamsSchema }),
  identityController.revokeSession,
);
