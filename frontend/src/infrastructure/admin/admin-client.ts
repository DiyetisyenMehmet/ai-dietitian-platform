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
  resolveIdentifier(input: { kind: "email" | "phone"; value: string }): Promise<{ accepted: boolean }> {
    return apiRequest<{ accepted: boolean }>({
      path: "/admin/auth/identifier",
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  loginWithEmail(email: string, password: string): Promise<AuthSession> {
    return apiRequest<AuthSession>({
      path: "/admin/auth/login",
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  loginWithPhone(idToken: string): Promise<AuthSession> {
    return apiRequest<AuthSession>({
      path: "/admin/auth/phone",
      method: "POST",
      body: JSON.stringify({ idToken }),
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
