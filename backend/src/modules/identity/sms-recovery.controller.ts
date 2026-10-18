import type { CookieOptions, Request, RequestHandler } from "express";
import { env, isProduction } from "../../config/env";
import { clearRefreshCookie } from "../auth/auth.controller";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { phonePasswordMiddleware } from "./phone-password.controller";
import { requireSmsRecovery, smsRecoveryService } from "./sms-recovery.service";
const NAME = "diewish_sms_recovery";
const options = (expires?: Date): CookieOptions => ({
  httpOnly: true,
  secure: isProduction || env.REFRESH_COOKIE_SAME_SITE === "none",
  sameSite: env.REFRESH_COOKIE_SAME_SITE,
  path: `${env.API_PREFIX.replace(/\/$/, "")}/identity/sms-recovery`,
  ...(expires ? { expires } : {}),
});
function secret(req: Request) {
  const value = req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(NAME + "="))
    ?.slice(NAME.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
export const smsRecoveryGate: RequestHandler = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  try {
    requireSmsRecovery();
  } catch (error) {
    next(error);
    return;
  }
  phonePasswordMiddleware.gate(req, res, next);
};
export const smsRecoveryController = {
  status: asyncHandler(async (req, res) => {
    sendSuccess(res, await smsRecoveryService.status(secret(req)));
  }),
  begin: asyncHandler(async (req, res) => {
    const result = await smsRecoveryService.begin(req.body, secret(req));
    res.cookie(NAME, result.secret, options(new Date(result.expiresAt)));
    sendSuccess(res, { expiresAt: result.expiresAt });
  }),
  verify: asyncHandler(async (req, res) => {
    sendSuccess(res, await smsRecoveryService.verify(secret(req), req.body));
  }),
  cancel: asyncHandler(async (req, res) => {
    await smsRecoveryService.cancel(secret(req));
    res.clearCookie(NAME, options());
    sendSuccess(res, { cancelled: true });
  }),
  complete: asyncHandler(async (req, res) => {
    const result = await smsRecoveryService.complete(secret(req), req.body);
    res.clearCookie(NAME, options());
    clearRefreshCookie(res);
    sendSuccess(res, result);
  }),
};
