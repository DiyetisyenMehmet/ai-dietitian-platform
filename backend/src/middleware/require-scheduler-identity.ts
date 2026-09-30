import type { NextFunction, Request, RequestHandler, Response } from "express";

import { env } from "../config/env";
import { logger } from "../lib/logger";
import { ApiError } from "../utils/api-error";
import { verifySchedulerOidcToken } from "../scheduler/scheduler-identity";

export type SchedulerTokenVerifier = (token: string) => Promise<unknown>;

interface SchedulerIdentityOptions {
  enabled: boolean;
  verifyToken: SchedulerTokenVerifier;
}

/**
 * Application-level guard for the public Cloud Run service. Cloud Scheduler
 * presents a Google-signed OIDC token; ordinary internet callers cannot trigger
 * scheduler work by merely knowing the endpoint URL.
 */
export function createRequireSchedulerIdentity(
  options: SchedulerIdentityOptions,
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!options.enabled) {
      next(
        new ApiError(404, "Scheduler trigger is not enabled.", {
          code: "SCHEDULER_TRIGGER_DISABLED",
        }),
      );
      return;
    }

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(
        new ApiError(401, "Scheduler authentication is required.", {
          code: "SCHEDULER_AUTH_REQUIRED",
        }),
      );
      return;
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      next(
        new ApiError(401, "Scheduler authentication is required.", {
          code: "SCHEDULER_AUTH_REQUIRED",
        }),
      );
      return;
    }

    try {
      await options.verifyToken(token);
      next();
    } catch (error) {
      logger.warn(
        { err: error instanceof Error ? error.message : "unknown verification error" },
        "Rejected external scheduler identity",
      );
      next(
        new ApiError(403, "Scheduler identity is not authorized.", {
          code: "SCHEDULER_IDENTITY_INVALID",
        }),
      );
    }
  };
}

export const requireSchedulerIdentity = createRequireSchedulerIdentity({
  enabled: env.SCHEDULER_TRIGGER_ENABLED,
  verifyToken: (token) =>
    verifySchedulerOidcToken(token, {
      audience: env.SCHEDULER_OIDC_AUDIENCE,
      serviceAccountEmail: env.SCHEDULER_SERVICE_ACCOUNT_EMAIL,
    }),
});
