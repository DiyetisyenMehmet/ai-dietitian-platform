import { apiRequest } from "@/infrastructure/api/http-client";
import type { AuthSession } from "@/domain/auth/types";

export interface AccountSessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
}

function sanitizeSession(session: AuthSession): AuthSession {
  const email = session.user.email;
  if (email?.endsWith(".diewish.invalid")) {
    return { ...session, user: { ...session.user, email: null } };
  }
  return session;
}

export const identityClient = {
  async external(idToken: string): Promise<AuthSession> {
    const session = await apiRequest<AuthSession>({
      path: "/identity/external",
      method: "POST",
      body: JSON.stringify({ idToken }),
    });
    return sanitizeSession(session);
  },

  guest(): Promise<AuthSession> {
    return apiRequest<AuthSession>({
      path: "/identity/guest",
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  async convertGuest(input: {
    email: string;
    password: string;
    fullName?: string;
  }): Promise<AuthSession> {
    const session = await apiRequest<AuthSession>({
      path: "/identity/guest/convert",
      method: "POST",
      auth: true,
      body: JSON.stringify(input),
    });
    return sanitizeSession(session);
  },

  async reactivate(email: string, password: string): Promise<AuthSession> {
    const session = await apiRequest<AuthSession>({
      path: "/identity/reactivate",
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return sanitizeSession(session);
  },

  deactivate(): Promise<{ message: string }> {
    return apiRequest<{ message: string }>({
      path: "/identity/deactivate",
      method: "POST",
      auth: true,
      retryOnUnauthorized: false,
      body: JSON.stringify({ confirm: true }),
    });
  },

  sessions(): Promise<{ sessions: AccountSessionSummary[] }> {
    return apiRequest<{ sessions: AccountSessionSummary[] }>({
      path: "/identity/sessions",
      method: "GET",
      auth: true,
    });
  },

  revokeSession(id: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>({
      path: `/identity/sessions/${encodeURIComponent(id)}`,
      method: "DELETE",
      auth: true,
    });
  },
};
