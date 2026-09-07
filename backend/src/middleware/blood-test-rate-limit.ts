import rateLimit from "express-rate-limit";

import { env } from "../config/env";
import { sendError } from "../utils/api-response";

/**
 * Upload-specific limiter layered on top of the global API limiter. MemoryStore
 * is acceptable for the current single-instance development topology; the
 * limiter remains isolated so a shared store can be supplied later.
 */
export const bloodTestUploadRateLimiter = rateLimit({
  windowMs: env.BLOOD_TEST_UPLOAD_RATE_LIMIT_WINDOW_MS,
  max: env.BLOOD_TEST_UPLOAD_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(
      res,
      429,
      "TOO_MANY_REQUESTS",
      "Too many blood-test upload attempts. Please try again later.",
    );
  },
});
