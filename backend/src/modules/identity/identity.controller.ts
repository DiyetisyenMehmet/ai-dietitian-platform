import type { CookieOptions, Request, Response } from "express";

import { env, isProduction } from "../../config/env";
import { ApiError } from "../../utils/api-error";
import { sendCreated, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import type { LoginInput } from "../auth/auth.schemas";
import type { SessionContext } from "../auth/auth.service";
import { externalLoginService } from "./external-login.service";
import { guestService } from "./guest.service";
import type { ExternalLoginInput } from "./identity.schemas";
import { lifecycleService } from "./lifecycle.service";
import { reactivationService } from "./reactivation.service";

const REFRESH_COOKIE_PATH = `${env.API_PREFIX.replace(/\/$/, "")}/auth`;

function context(req: Request): SessionContext {
  return { userAgent: req.headers["user-agent"] ?? null, ipAddress: req.ip ?? null };
}

function refreshCookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction || env.REFRESH_COOKIE_SAME_SITE === "none",
    sameSite: env.REFRESH_COOKIE_SAME_SITE,
    path: REFRESH_COOKIE_PATH,
    ...(expires ? { expires } : {}),
  };
}

function writeRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(env.REFRESH_COOKIE_NAME, token, refreshCookieOptions(expiresAt));
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions());
}

function userId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

export const identityController = {
  externalLogin: asyncHandler(async (req: Request, res: Response) => {
    const { idToken } = req.body as ExternalLoginInput;
    const result = await externalLoginService.login(idToken, context(req));
    writeRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, { user: result.user, tokens: result.tokens });
  }),

  guest: asyncHandler(async (req: Request, res: Response) => {
    const result = await guestService.create(context(req));
    sendCreated(res, { user: result.user, tokens: result.tokens });
  }),

  deactivate: asyncHandler(async (req: Request, res: Response) => {
    await lifecycleService.deactivate(userId(req));
    clearRefreshCookie(res);
    sendSuccess(res, { message: "Account deactivated. Sign in again to reactivate it." });
  }),

  reactivate: asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginInput;
    const result = await reactivationService.withPassword(email, password, context(req));
    writeRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, { user: result.user, tokens: result.tokens });
  }),

  sessions: asyncHandler(async (req: Request, res: Response) => {
    const sessions = await lifecycleService.listSessions(userId(req));
    sendSuccess(res, { sessions });
  }),

  revokeSession: asyncHandler(async (req: Request, res: Response) => {
    await lifecycleService.revokeSession(userId(req), req.params.id!);
    sendSuccess(res, { message: "Session revoked." });
  }),
};
