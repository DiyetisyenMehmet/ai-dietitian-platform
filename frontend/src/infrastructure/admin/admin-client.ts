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

  loginWithPhone(idToken: string): Promise<AuthSession> {
    return apiRequest<AuthSession>({
      path: "/admin/auth/phone",
      method: "POST",
      body: JSON.stringify({ idToken }),
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
