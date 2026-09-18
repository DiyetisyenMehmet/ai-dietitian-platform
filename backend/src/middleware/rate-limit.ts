import type { Request } from "express";
import rateLimit from "express-rate-limit";

import { env } from "../config/env";
import { sendError } from "../utils/api-response";

const apiPrefix = env.API_PREFIX.replace(/\/$/, "");
const dedicatedAuthPaths = new Set([
  `${apiPrefix}/auth/login`,
  `${apiPrefix}/auth/register`,
  `${apiPrefix}/auth/refresh-token`,
]);

function hasDedicatedAuthLimiter(req: Request): boolean {
  const path = req.originalUrl.split("?", 1)[0] ?? req.originalUrl;
  return dedicatedAuthPaths.has(path);
}

/**
 * Global API rate limiter (AD-020). Limits are configurable via environment
 * and responses use the standard error envelope. Standard RateLimit headers
 * are exposed so clients can back off gracefully.
 *
 * Login/register/refresh are intentionally excluded here because each has a
 * dedicated abuse policy. Double-counting those requests in the global
 * per-IP bucket can lock out a legitimate user after ordinary app activity.
 */
export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: hasDedicatedAuthLimiter,
  handler: (_req, res) => {
    sendError(res, 429, "TOO_MANY_REQUESTS", "Too many requests, please try again later.");
  },
});
