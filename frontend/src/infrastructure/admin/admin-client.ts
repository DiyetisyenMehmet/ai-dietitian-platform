import type { AuthSession } from "@/domain/auth/types";
import { apiRequest } from "@/infrastructure/api/http-client";

export type AdminPermission =
  | "admin.access"
  | "admin.security.read"
  | "admin.access.manage"
  | "admin.audit.read";

export interface AdminManagedUser {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  roles: string[];
  accessLevel: "LIMITED" | "FULL";
}

export interface AdminAuditRecord {
  id: string;
  actorAdminId: string;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  targetEmail: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  reason: string | null;
  environment: string;
  riskLevel: string;
  createdAt: string;
}

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

  requestFirstSuperAdminBootstrap(email: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>({
      path: "/admin/auth/bootstrap",
      method: "POST",
      body: JSON.stringify({ email }),
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

  listAccessUsers(): Promise<{ users: AdminManagedUser[] }> {
    return apiRequest<{ users: AdminManagedUser[] }>({
      path: "/admin/access/users",
      method: "GET",
      auth: true,
    });
  },

  createAccessUser(payload: {
    email: string;
    fullName?: string;
    temporaryPassword: string;
    accessLevel: "LIMITED" | "FULL";
  }): Promise<{ user: AdminManagedUser }> {
    return apiRequest<{ user: AdminManagedUser }>({
      path: "/admin/access/users",
      method: "POST",
      auth: true,
      body: JSON.stringify(payload),
    });
  },

  updateAccessUser(
    id: string,
    payload: { accessLevel: "LIMITED" | "FULL"; isActive?: boolean },
  ): Promise<{ user: { id: string; email: string; accessLevel: "LIMITED" | "FULL"; isActive: boolean; roles: string[] } }> {
    return apiRequest({
      path: `/admin/access/users/${encodeURIComponent(id)}`,
      method: "PATCH",
      auth: true,
      body: JSON.stringify(payload),
    });
  },

  getAudit(): Promise<{ events: AdminAuditRecord[] }> {
    return apiRequest<{ events: AdminAuditRecord[] }>({
      path: "/admin/audit",
      method: "GET",
      auth: true,
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
