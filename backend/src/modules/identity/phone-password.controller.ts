import type { CookieOptions, Request, RequestHandler } from "express";
import { env, isProduction } from "../../config/env";
import { authenticate } from "../../middleware/authenticate";
import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { writeIdentityRefreshCookie } from "./identity.controller";
import { phonePasswordService, requirePhonePassword } from "./phone-password.service";

const COOKIE = "diewish_phone_setup";
const cookieOptions = (expires?: Date): CookieOptions => ({
  httpOnly: true,
  secure: isProduction || env.REFRESH_COOKIE_SAME_SITE === "none",
  sameSite: env.REFRESH_COOKIE_SAME_SITE,
  path: `${env.API_PREFIX.replace(/\/$/, "")}/identity/phone-password`,
  ...(expires ? { expires } : {}),
});
// No cookie-parser dependency: only a fixed name and base64url secret are read.
function secret(req: Request): string | undefined {
  const value = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
const headers: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
};
const gate: RequestHandler = (req, res, next) => {
  headers(req, res, () => {});
  try {
    requirePhonePassword();
    // Custom header forces a browser preflight; never accept form POSTs using
    // an ambient cross-site cookie. Also fail explicitly on untrusted origins.
    const allowed = [...env.CORS_ORIGIN.split(","), env.APP_WEB_URL].map((origin) =>
      origin.trim().replace(/\/$/, ""),
    );
    if (
      req.get("x-diewish-phone-setup") !== "1" ||
      (req.get("origin") && !allowed.includes(req.get("origin")!))
    )
      throw ApiError.forbidden("Phone verification request is not allowed.");
    next();
  } catch (error) {
    next(error);
  }
};
const optionalPrincipal: RequestHandler = (req, res, next) => {
  if (req.headers.authorization) {
    authenticate(req, res, next);
  } else {
    next();
  }
};
export const phonePasswordMiddleware = { headers, gate, optionalPrincipal };
const context = (req: Request) => ({
  userAgent: req.headers["user-agent"] ?? null,
  ipAddress: req.ip ?? null,
});
export const phonePasswordController = {
  status: asyncHandler(async (req, res) => {
    sendSuccess(res, await phonePasswordService.status(secret(req)));
  }),
  start: asyncHandler(async (req, res) => {
    const result = await phonePasswordService.start(req.body, secret(req), req.user?.id);
    res.cookie(COOKIE, result.secret, cookieOptions(new Date(result.expiresAt)));
    sendSuccess(res, { expiresAt: result.expiresAt });
  }),
  cancel: asyncHandler(async (req, res) => {
    await phonePasswordService.cancel(secret(req));
    res.clearCookie(COOKIE, cookieOptions());
    sendSuccess(res, { cancelled: true });
  }),
  complete: asyncHandler(async (req, res) => {
    const result = await phonePasswordService.complete(secret(req), req.body, context(req));
    res.clearCookie(COOKIE, cookieOptions());
    writeIdentityRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, { user: result.user, tokens: result.tokens });
  }),
  login: asyncHandler(async (req, res) => {
    const result = await phonePasswordService.login(req.body, context(req));
    writeIdentityRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, { user: result.user, tokens: result.tokens });
  }),
};
