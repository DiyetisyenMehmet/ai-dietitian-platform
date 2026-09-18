import rateLimit from "express-rate-limit";

import { env } from "../config/env";
import { sendError } from "../utils/api-response";

export interface AuthRateLimitPolicy {
  max: number;
  code: string;
  message: string;
  skipSuccessfulRequests?: boolean;
}

/**
 * Creates an isolated limiter store for one authentication action.
 *
 * Keeping login/register/refresh in separate stores is intentional:
 * a healthy refresh cycle must never consume the user's login budget, and
 * ordinary successful sign-ins must not look like brute-force attempts.
 */
export function createAuthRateLimiter(policy: AuthRateLimitPolicy) {
  return rateLimit({
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    max: policy.max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: policy.skipSuccessfulRequests ?? false,
    handler: (_req, res) => {
      sendError(res, 429, policy.code, policy.message);
    },
  });
}

/**
 * Count only failed login responses toward the brute-force budget.
 * A successful login is not an abuse signal and should not lock the user out.
 */
export const loginRateLimiter = createAuthRateLimiter({
  max: env.AUTH_RATE_LIMIT_MAX,
  code: "AUTH_LOGIN_RATE_LIMITED",
  message: "Too many failed login attempts. Please try again later.",
  skipSuccessfulRequests: true,
});

/**
 * Registration remains a strict per-IP budget because successful account
 * creation is itself an abuse-sensitive action.
 */
export const registerRateLimiter = createAuthRateLimiter({
  max: env.AUTH_RATE_LIMIT_MAX,
  code: "AUTH_REGISTER_RATE_LIMITED",
  message: "Too many registration attempts. Please try again later.",
});

/**
 * Refresh traffic has its own, larger failure budget. Successful rotations do
 * not count, so normal app hydration/token rotation cannot consume login quota.
 */
export const refreshRateLimiter = createAuthRateLimiter({
  max: Math.max(env.AUTH_RATE_LIMIT_MAX * 6, 30),
  code: "AUTH_REFRESH_RATE_LIMITED",
  message: "Too many failed session refresh attempts. Please try again later.",
  skipSuccessfulRequests: true,
});
