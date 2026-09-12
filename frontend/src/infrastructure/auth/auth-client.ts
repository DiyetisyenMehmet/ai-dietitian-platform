import { apiRequest } from "@/infrastructure/api/http-client";
import type { AuthSession, AuthUser } from "@/domain/auth/types";
import { AUTH_ENDPOINTS } from "@/infrastructure/auth/endpoints";

function sanitizeUser(user: AuthUser): AuthUser {
  if (user.email?.endsWith(".diewish.invalid")) return { ...user, email: null };
  return user;
}

function sanitizeSession(session: AuthSession): AuthSession {
  return { ...session, user: sanitizeUser(session.user) };
}

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
  async refresh(): Promise<AuthSession> {
    return sanitizeSession(
      await apiRequest<AuthSession>({
        path: AUTH_ENDPOINTS.refresh,
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
  },

  /** Revokes the refresh-cookie session server-side and clears the cookie. */
  logout() {
    return apiRequest<{ message: string }>({
      path: AUTH_ENDPOINTS.logout,
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  async me(): Promise<{ user: AuthUser }> {
    const result = await apiRequest<{ user: AuthUser }>({
      path: AUTH_ENDPOINTS.me,
      method: "GET",
      auth: true,
    });
    return { user: sanitizeUser(result.user) };
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
