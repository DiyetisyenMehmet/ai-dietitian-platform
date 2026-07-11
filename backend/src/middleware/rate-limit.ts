import rateLimit from "express-rate-limit";

import { env } from "../config/env";
import { sendError } from "../utils/api-response";

/**
 * Global API rate limiter (AD-020). Limits are configurable via environment
 * and responses use the standard error envelope. Standard `RateLimit-*`
 * headers are exposed so clients can back off gracefully.
 */
export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, "TOO_MANY_REQUESTS", "Too many requests, please try again later.");
  },
});
