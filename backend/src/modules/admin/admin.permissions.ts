export const ADMIN_PERMISSIONS = {
  ACCESS: "admin.access",
  SECURITY_READ: "admin.security.read",
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
] as const;

export const ADMIN_SYSTEM_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

export const ADMIN_ROLE_DEFINITIONS = [
  {
    key: ADMIN_SYSTEM_ROLES.SUPER_ADMIN,
    name: "Super Admin",
    description:
      "Foundation system role. It receives explicit permissions and never bypasses audit or environment controls.",
    permissions: [ADMIN_PERMISSIONS.ACCESS, ADMIN_PERMISSIONS.SECURITY_READ],
  },
] as const;

const permissionKeys = new Set<string>(
  ADMIN_PERMISSION_DEFINITIONS.map((permission) => permission.key),
);

export function isAdminPermissionKey(value: string): value is AdminPermissionKey {
  return permissionKeys.has(value);
}
