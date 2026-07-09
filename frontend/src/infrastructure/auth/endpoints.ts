/**
 * Auth endpoint paths (relative to NEXT_PUBLIC_API_BASE_URL).
 *
 * NOTE: The backend REST contract is not yet frozen in this repository.
 * These paths follow conventional REST auth naming and are each overridable
 * via environment variables so they can be aligned with the real backend
 * WITHOUT code changes. Until confirmed against the backend they are treated
 * as configurable defaults (see README / Open Questions), not invented
 * business endpoints.
 */
export const AUTH_ENDPOINTS = {
  login: process.env.NEXT_PUBLIC_AUTH_LOGIN_PATH ?? "/auth/login",
  register: process.env.NEXT_PUBLIC_AUTH_REGISTER_PATH ?? "/auth/register",
  forgotPassword: process.env.NEXT_PUBLIC_AUTH_FORGOT_PASSWORD_PATH ?? "/auth/forgot-password",
  resetPassword: process.env.NEXT_PUBLIC_AUTH_RESET_PASSWORD_PATH ?? "/auth/reset-password",
  verifyEmail: process.env.NEXT_PUBLIC_AUTH_VERIFY_EMAIL_PATH ?? "/auth/verify-email",
} as const;
