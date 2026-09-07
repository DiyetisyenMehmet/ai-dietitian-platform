import type { CookieOptions, Request, Response } from "express";

import { corsOrigins, env, isProduction } from "../../config/env";
import { ApiError } from "../../utils/api-error";
import { sendCreated, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { authService, type AuthResult, type SessionContext } from "./auth.service";
import type { LoginInput, RegisterInput } from "./auth.schemas";

const REFRESH_COOKIE_PATH = `${env.API_PREFIX.replace(/\/$/, "")}/auth`;

/** Derives best-effort session metadata from the request for auditing. */
function sessionContext(req: Request): SessionContext {
  return {
    userAgent: req.headers["user-agent"] ?? null,
    ipAddress: req.ip ?? null,
  };
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

function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    const key = item.slice(0, separator).trim();
    if (key !== name) continue;
    const value = item.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

function requireRefreshCookie(req: Request): string {
  const token = readCookie(req, env.REFRESH_COOKIE_NAME);
  if (!token) {
    throw ApiError.unauthorized("Refresh session is missing or expired.");
  }
  return token;
}

/**
 * Cookie-authenticated state-changing requests must originate from one of the
 * explicitly configured frontend origins. Requests without Origin are allowed
 * for non-browser clients; browsers include Origin for cross-origin POSTs.
 */
function assertTrustedOrigin(req: Request): void {
  const origin = req.headers.origin;
  if (origin && !corsOrigins.includes(origin)) {
    throw ApiError.forbidden("Untrusted request origin.");
  }
}

function publicAuthResult(result: AuthResult) {
  return { user: result.user, tokens: result.tokens };
}

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as RegisterInput;
    const result = await authService.register(input, sessionContext(req));
    writeRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendCreated(res, publicAuthResult(result));
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as LoginInput;
    const result = await authService.login(input, sessionContext(req));
    writeRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, publicAuthResult(result));
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    assertTrustedOrigin(req);
    const refreshToken = requireRefreshCookie(req);
    const result = await authService.refresh(refreshToken, sessionContext(req));
    writeRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, publicAuthResult(result));
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    assertTrustedOrigin(req);
    const refreshToken = readCookie(req, env.REFRESH_COOKIE_NAME);
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    clearRefreshCookie(res);
    sendSuccess(res, { message: "Logged out successfully." });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized("Authentication required.");
    }
    const user = await authService.getCurrentUser(req.user.id);
    sendSuccess(res, { user });
  }),
};
