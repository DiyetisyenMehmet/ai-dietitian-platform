import type { AuthSession } from "@/domain/auth/types";
import { apiRequest } from "@/infrastructure/api/http-client";

export type AdminPermission = "admin.access" | "admin.security.read";

export interface AdminEnvironmentIdentity {
  environment: "development" | "test" | "staging" | "production";
  application: string;
  version: string;
  commit: string;
}

export interface AdminSession {
  admin: {
    id: string;
    email: string;
    fullName: string | null;
  };
  roles: string[];
  permissions: AdminPermission[];
  environment: AdminEnvironmentIdentity;
}

export const adminClient = {
  loginWithEmail(email: string, password: string): Promise<AuthSession> {
    return apiRequest<AuthSession>({
      path: "/admin/auth/login",
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  bootstrapFirstSuperAdmin(idToken: string, password: string): Promise<AuthSession> {
    return apiRequest<AuthSession>({
      path: "/admin/auth/bootstrap",
      method: "POST",
      body: JSON.stringify({ idToken, password }),
    });
  },

  requestPasswordReset(email: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>({
      path: "/admin/auth/password/forgot",
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>({
      path: "/admin/auth/password/reset",
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    });
  },

  changeEmail(payload: { currentPassword: string; newEmail: string }): Promise<AuthSession> {
    return apiRequest<AuthSession>({
      path: "/admin/account/email",
      method: "PATCH",
      auth: true,
      body: JSON.stringify(payload),
    });
  },

  changePassword(payload: { currentPassword: string; newPassword: string }): Promise<AuthSession> {
    return apiRequest<AuthSession>({
      path: "/admin/account/password",
      method: "PATCH",
      auth: true,
      body: JSON.stringify(payload),
    });
  },

  getSession(): Promise<AdminSession> {
    return apiRequest<AdminSession>({
      path: "/admin/session",
      method: "GET",
      auth: true,
    });
  },
};
