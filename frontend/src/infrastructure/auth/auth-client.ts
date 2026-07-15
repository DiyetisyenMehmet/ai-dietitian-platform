import { apiRequest } from "@/infrastructure/api/http-client";
import type { AuthSession, AuthUser } from "@/domain/auth/types";
import { AUTH_ENDPOINTS } from "@/infrastructure/auth/endpoints";

/**
 * Infrastructure-level auth client. Translates auth intents into HTTP calls
 * using the shared, endpoint-agnostic http-client. Contains no UI or
 * validation logic. Responses are already envelope-unwrapped by the client.
 */
export const authClient = {
  login(payload: { email: string; password: string }) {
    return apiRequest<AuthSession>({
      path: AUTH_ENDPOINTS.login,
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  register(payload: { fullName: string; email: string; password: string }) {
    return apiRequest<AuthSession>({
      path: AUTH_ENDPOINTS.register,
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Exchanges a refresh token for a new session (token rotation). */
  refresh(payload: { refreshToken: string }) {
    return apiRequest<AuthSession>({
      path: AUTH_ENDPOINTS.refresh,
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Revokes the given refresh token server-side. */
  logout(payload: { refreshToken: string }) {
    return apiRequest<{ message: string }>({
      path: AUTH_ENDPOINTS.logout,
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Fetches the authenticated user's profile using the access token. */
  me() {
    return apiRequest<{ user: AuthUser }>({
      path: AUTH_ENDPOINTS.me,
      method: "GET",
      auth: true,
    });
  },

  forgotPassword(payload: { email: string }) {
    return apiRequest<{ message: string }>({
      path: AUTH_ENDPOINTS.forgotPassword,
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  resetPassword(payload: { token: string; password: string }) {
    return apiRequest<{ message: string }>({
      path: AUTH_ENDPOINTS.resetPassword,
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  verifyEmail(payload: { token: string }) {
    return apiRequest<{ message: string }>({
      path: AUTH_ENDPOINTS.verifyEmail,
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
} as const;
