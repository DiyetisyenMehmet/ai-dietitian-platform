import type { CookieOptions, Request, Response } from "express";

import { env, isProduction } from "../../config/env";
import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import type { SessionContext } from "../auth/auth.service";
import { adminAuthService } from "./admin-auth.service";
import type {
  AdminBootstrapInput,
  AdminEmailChangeInput,
  AdminEmailLoginInput,
  AdminForgotPasswordInput,
  AdminPasswordChangeInput,
  AdminResetPasswordInput,
} from "./admin-auth.schemas";

const REFRESH_COOKIE_PATH = `${env.API_PREFIX.replace(/\/$/, "")}/auth`;

function context(req: Request): SessionContext {
  return { userAgent: req.headers["user-agent"] ?? null, ipAddress: req.ip ?? null };
}

function requestIdentity(req: Request) {
  const requestId = String(req.id);
  return { correlationId: requestId, requestId };
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

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

export const adminAuthController = {
  emailLogin: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as AdminEmailLoginInput;
    const result = await adminAuthService.loginWithEmail(input.email, input.password, context(req));
    writeRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, { user: result.user, tokens: result.tokens });
  }),

  bootstrap: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as AdminBootstrapInput;
    await adminAuthService.requestFirstSuperAdminBootstrap(input.email);
    sendSuccess(res, {
      message: "Hesap uygunsa kurulum bağlantısı e-posta adresine gönderildi.",
    });
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as AdminForgotPasswordInput;
    await adminAuthService.requestPasswordReset(input.email, context(req));
    sendSuccess(res, {
      message: "Hesap uygunsa şifre sıfırlama bağlantısı e-posta adresine gönderildi.",
    });
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as AdminResetPasswordInput;
    await adminAuthService.resetPassword(input.token, input.newPassword, context(req));
    sendSuccess(res, { message: "Şifreniz güncellendi." });
  }),

  changeEmail: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as AdminEmailChangeInput;
    const result = await adminAuthService.changePrimaryEmail(
      requireUserId(req), input.currentPassword, input.newEmail, context(req), requestIdentity(req),
    );
    writeRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, { user: result.user, tokens: result.tokens });
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as AdminPasswordChangeInput;
    const result = await adminAuthService.changePassword(
      requireUserId(req), input.currentPassword, input.newPassword, context(req), requestIdentity(req),
    );
    writeRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, { user: result.user, tokens: result.tokens });
  }),
};
