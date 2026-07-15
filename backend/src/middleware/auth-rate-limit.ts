import rateLimit from "express-rate-limit";

import { env } from "../config/env";
import { sendError } from "../utils/api-response";

/**
 * Stricter limiter for unauthenticated auth endpoints (login/register/refresh)
 * to blunt credential-stuffing and brute-force attempts (Gap A2 / I-13). It is
 * keyed per-IP and applied on top of the global limiter. Successful requests
 * still count toward the limit, which is acceptable for these low-frequency
 * endpoints.
 */
export const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(
      res,
      429,
      "TOO_MANY_REQUESTS",
      "Too many authentication attempts. Please try again later.",
    );
  },
});
