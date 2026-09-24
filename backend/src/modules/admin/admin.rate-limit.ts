import rateLimit from "express-rate-limit";

import { env } from "../../config/env";
import { sendError } from "../../utils/api-response";

/**
 * Additional isolated Management Center limiter. It does not change ordinary
 * Diewish user rate-limit behavior.
 */
export const adminRateLimiter = rateLimit({
  windowMs: env.ADMIN_RATE_LIMIT_WINDOW_MS,
  max: env.ADMIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(
      res,
      429,
      "ADMIN_RATE_LIMITED",
      "Too many Management Center requests, please try again later.",
    );
  },
});
