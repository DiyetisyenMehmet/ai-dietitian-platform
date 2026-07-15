/**
 * Auth & onboarding endpoint paths (relative to NEXT_PUBLIC_API_BASE_URL).
 * These match the backend REST contract delivered in Sprints 8–9.
 */
export const AUTH_ENDPOINTS = {
  login: "/auth/login",
  register: "/auth/register",
  refresh: "/auth/refresh-token",
  logout: "/auth/logout",
  me: "/auth/me",
  // Account-lifecycle flows (password reset / email verification) are delivered
  // in a later sprint; paths are kept so existing placeholder screens compile.
  forgotPassword: "/auth/forgot-password",
  resetPassword: "/auth/reset-password",
  verifyEmail: "/auth/verify-email",
} as const;

export const ONBOARDING_ENDPOINTS = {
  /** GET current profile / POST to complete onboarding. */
  base: "/onboarding",
} as const;
