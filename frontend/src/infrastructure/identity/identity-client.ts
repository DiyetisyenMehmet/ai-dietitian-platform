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
  phoneSetupStatus(): Promise<{ enabled: boolean; pending: boolean; expiresAt?: string }> {
    return apiRequest({ path: "/identity/phone-password/status", cache: "no-store", retryOnUnauthorized: false });
  },
  phoneSetupStart(phoneNumber: string, idToken: string, legacyAccessToken?: string): Promise<{ expiresAt: string }> {
    return apiRequest({ path: "/identity/phone-password/start", method: "POST", retryOnUnauthorized: false,
      headers: { "x-diewish-phone-setup": "1", ...(legacyAccessToken ? { Authorization: `Bearer ${legacyAccessToken}` } : {}) },
      body: JSON.stringify({ phoneNumber, idToken }) });
  },
  async phoneSetupComplete(password: string, passwordConfirmation: string): Promise<AuthSession> {
    return sanitizeSession(await apiRequest<AuthSession>({ path: "/identity/phone-password/complete", method: "POST", retryOnUnauthorized: false,
      headers: { "x-diewish-phone-setup": "1" }, body: JSON.stringify({ password, passwordConfirmation }) }));
  },
  phoneSetupCancel(): Promise<{ cancelled: boolean }> {
    return apiRequest({ path: "/identity/phone-password/cancel", method: "POST", retryOnUnauthorized: false,
      headers: { "x-diewish-phone-setup": "1" }, body: "{}" });
  },
  async phonePasswordLogin(phoneNumber: string, password: string): Promise<AuthSession> {
    return sanitizeSession(await apiRequest<AuthSession>({ path: "/identity/phone-password/login", method: "POST", retryOnUnauthorized: false,
      headers: { "x-diewish-phone-setup": "1" }, body: JSON.stringify({ phoneNumber, password }) }));
  },
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
