import type { NextFunction, Request, RequestHandler, Response } from "express";

import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";

export type DiewishRuntimeEnvironment =
  | "development"
  | "test"
  | "staging"
  | "production";

export function resolveRuntimeEnvironment(): DiewishRuntimeEnvironment {
  if (env.DIEWISH_ENVIRONMENT) return env.DIEWISH_ENVIRONMENT;
  if (env.NODE_ENV === "test") return "test";
  if (env.NODE_ENV === "production") return "production";
  return "development";
}

export function getAdminEnvironmentIdentity() {
  return {
    environment: resolveRuntimeEnvironment(),
    application: "diewish-backend",
    version: process.env.npm_package_version ?? "0.1.0",
    commit: env.DIEWISH_APPLICATION_SHA ?? "unknown",
  } as const;
}

export function isAdminFoundationEnvironment(
  environment: DiewishRuntimeEnvironment,
): boolean {
  return environment !== "production";
}

/**
 * Phase 1 is staging/development/test only. If the foundation reaches a
 * production runtime before explicit approval, only Management Center fails
 * closed; normal Diewish APIs remain independent.
 */
export const requireAdminFoundationEnvironment: RequestHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const environment = resolveRuntimeEnvironment();
  if (!isAdminFoundationEnvironment(environment)) {
    next(
      new ApiError(403, "Management Center is not enabled in this environment.", {
        code: "ADMIN_ENVIRONMENT_DISABLED",
      }),
    );
    return;
  }
  next();
};
