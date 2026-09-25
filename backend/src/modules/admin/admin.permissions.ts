export const ADMIN_PERMISSIONS = {
  ACCESS: "admin.access",
  SECURITY_READ: "admin.security.read",
  ACCESS_MANAGE: "admin.access.manage",
  AUDIT_READ: "admin.audit.read",
} as const;

export type AdminPermissionKey =
  (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

export interface AdminPermissionDefinition {
  key: AdminPermissionKey;
  description: string;
}

export const ADMIN_PERMISSION_DEFINITIONS: readonly AdminPermissionDefinition[] = [
  {
    key: ADMIN_PERMISSIONS.ACCESS,
    description: "Enter the Diewish Management Center foundation.",
  },
  {
    key: ADMIN_PERMISSIONS.SECURITY_READ,
    description: "Read Management Center access and security foundation details.",
  },
  {
    key: ADMIN_PERMISSIONS.ACCESS_MANAGE,
    description: "Create Management Center staff accounts and change their access level.",
  },
  {
    key: ADMIN_PERMISSIONS.AUDIT_READ,
    description: "Read append-only Management Center audit history.",
  },
] as const;

export const ADMIN_SYSTEM_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN_STAFF: "ADMIN_STAFF",
} as const;

export const ADMIN_ROLE_DEFINITIONS = [
  {
    key: ADMIN_SYSTEM_ROLES.SUPER_ADMIN,
    name: "Super Admin",
    description:
      "Full Management Center foundation access. All mutations remain audited and environment-scoped.",
    permissions: [
      ADMIN_PERMISSIONS.ACCESS,
      ADMIN_PERMISSIONS.SECURITY_READ,
      ADMIN_PERMISSIONS.ACCESS_MANAGE,
      ADMIN_PERMISSIONS.AUDIT_READ,
    ],
  },
  {
    key: ADMIN_SYSTEM_ROLES.ADMIN_STAFF,
    name: "Admin Staff",
    description:
      "Limited Management Center access. Cannot create administrators, change access levels or read audit history.",
    permissions: [ADMIN_PERMISSIONS.ACCESS],
  },
] as const;

const permissionKeys = new Set<string>(
  ADMIN_PERMISSION_DEFINITIONS.map((permission) => permission.key),
);

export function isAdminPermissionKey(value: string): value is AdminPermissionKey {
  return permissionKeys.has(value);
}
