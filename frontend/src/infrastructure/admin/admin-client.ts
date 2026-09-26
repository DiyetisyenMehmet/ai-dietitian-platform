import type { AuthSession } from "@/domain/auth/types";
import { apiRequest } from "@/infrastructure/api/http-client";

export type AdminPermission = string;

export interface AdminRoleAssignment {
  roleKey: string;
  roleName: string;
  assignedAt: string;
  assignedByAdminId: string | null;
  assignedByName: string | null;
  assignedByEmail: string | null;
}

export interface AdminManagedUser {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  roles: string[];
  permissions: string[];
  roleAssignments: AdminRoleAssignment[];
  accessLevel: "LIMITED" | "FULL";
}

export interface AdminRoleDefinition {
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface AdminPermissionDefinition {
  key: string;
  description: string | null;
}

export interface AdminInvitation {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  roles: Array<{ key: string; name: string }>;
  isActive: boolean;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  invitedBy: {
    id: string;
    email: string;
    fullName: string | null;
  };
}

export interface AdminStaffSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  isActive: boolean;
}

export interface AdminAuditRecord {
  id: string;
  actorAdminId: string;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  module: string;
  targetType: string;
  targetId: string;
  targetEmail: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  reason: string | null;
  environment: string;
  correlationId: string;
  requestId: string;
  riskLevel: string;
  createdAt: string;
}

export interface AdminAuditFilters {
  admin?: string;
  user?: string;
  action?: string;
  module?: string;
  risk?: string;
  environment?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
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

function auditQuery(filters: AdminAuditFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `?${query}` : "";
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

  listStaff(): Promise<{ users: AdminManagedUser[] }> {
    return apiRequest<{ users: AdminManagedUser[] }>({
      path: "/admin/access/staff",
      method: "GET",
      auth: true,
    });
  },

  listRoles(): Promise<{ roles: AdminRoleDefinition[] }> {
    return apiRequest<{ roles: AdminRoleDefinition[] }>({
      path: "/admin/access/roles",
      method: "GET",
      auth: true,
    });
  },

  listPermissions(): Promise<{ permissions: AdminPermissionDefinition[] }> {
    return apiRequest<{ permissions: AdminPermissionDefinition[] }>({
      path: "/admin/access/permissions",
      method: "GET",
      auth: true,
    });
  },

  listInvitations(): Promise<{ invitations: AdminInvitation[] }> {
    return apiRequest<{ invitations: AdminInvitation[] }>({
      path: "/admin/access/invitations",
      method: "GET",
      auth: true,
    });
  },

  inviteStaff(payload: {
    email: string;
    fullName?: string;
    roleKeys: string[];
    reason: string;
  }): Promise<{ invitation: { id: string; userId: string; email: string; expiresAt: string } }> {
    return apiRequest({
      path: "/admin/access/invitations",
      method: "POST",
      auth: true,
      body: JSON.stringify(payload),
    });
  },

  createRole(payload: {
    name: string;
    description?: string;
    permissionKeys: string[];
    reason: string;
  }): Promise<{ role: AdminRoleDefinition }> {
    return apiRequest({
      path: "/admin/access/roles",
      method: "POST",
      auth: true,
      body: JSON.stringify(payload),
    });
  },

  updateRole(
    key: string,
    payload: {
      name: string;
      description?: string;
      permissionKeys: string[];
      reason: string;
    },
  ): Promise<{ role: AdminRoleDefinition }> {
    return apiRequest({
      path: `/admin/access/roles/${encodeURIComponent(key)}`,
      method: "PATCH",
      auth: true,
      body: JSON.stringify(payload),
    });
  },

  updateStaff(
    id: string,
    payload: { roleKeys: string[]; isActive?: boolean; reason: string },
  ): Promise<{ user: { id: string; email: string; isActive: boolean; roles: string[] } }> {
    return apiRequest({
      path: `/admin/access/staff/${encodeURIComponent(id)}`,
      method: "PATCH",
      auth: true,
      body: JSON.stringify(payload),
    });
  },

  listStaffSessions(id: string): Promise<{ sessions: AdminStaffSession[] }> {
    return apiRequest({
      path: `/admin/access/staff/${encodeURIComponent(id)}/sessions`,
      method: "GET",
      auth: true,
    });
  },

  revokeStaffSession(id: string, sessionId: string, reason: string): Promise<{ id: string; revoked: boolean }> {
    return apiRequest({
      path: `/admin/access/staff/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`,
      method: "DELETE",
      auth: true,
      body: JSON.stringify({ reason }),
    });
  },

  revokeAllStaffSessions(id: string, reason: string): Promise<{ revokedCount: number }> {
    return apiRequest({
      path: `/admin/access/staff/${encodeURIComponent(id)}/sessions`,
      method: "DELETE",
      auth: true,
      body: JSON.stringify({ reason }),
    });
  },

  getAudit(filters: AdminAuditFilters = {}): Promise<{ events: AdminAuditRecord[] }> {
    return apiRequest<{ events: AdminAuditRecord[] }>({
      path: `/admin/audit${auditQuery(filters)}`,
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
