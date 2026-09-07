import { apiRequest } from "@/infrastructure/api/http-client";
import type { AuthSession, AuthUser } from "@/domain/auth/types";
import { AUTH_ENDPOINTS } from "@/infrastructure/auth/endpoints";

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

  /** Rotates the HttpOnly refresh cookie and returns a fresh access session. */
  refresh() {
    return apiRequest<AuthSession>({
      path: AUTH_ENDPOINTS.refresh,
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  /** Revokes the refresh-cookie session server-side and clears the cookie. */
  logout() {
    return apiRequest<{ message: string }>({
      path: AUTH_ENDPOINTS.logout,
      method: "POST",
      body: JSON.stringify({}),
    });
  },

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
