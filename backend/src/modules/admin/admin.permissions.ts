export const ADMIN_PERMISSIONS = {
  ACCESS: "admin.access",
  SECURITY_READ: "admin.security.read",
  ACCESS_MANAGE: "admin.access.manage",
  ROLES_READ: "admin.roles.read",
  ROLES_MANAGE: "admin.roles.manage",
  STAFF_READ: "admin.staff.read",
  STAFF_MANAGE: "admin.staff.manage",
  AUDIT_READ: "audit.read",
  LEGACY_AUDIT_READ: "admin.audit.read",
  USERS_READ: "users.read",
  USERS_MANAGE: "users.manage",
  USER_SESSIONS_REVOKE: "users.sessions.revoke",
  HEALTH_SUMMARY_READ: "health.summary.read",
  HEALTH_SENSITIVE_READ: "health.sensitive.read",
  ENTITLEMENTS_READ: "entitlements.read",
  ENTITLEMENTS_GRANT: "entitlements.grant",
  ENTITLEMENTS_REVOKE: "entitlements.revoke",
  FLAGS_READ: "flags.read",
  FLAGS_WRITE: "flags.write",
  CONTENT_READ: "content.read",
  CONTENT_WRITE: "content.write",
  CONTENT_PUBLISH: "content.publish",
  ASSETS_READ: "assets.read",
  ASSETS_WRITE: "assets.write",
  ASSETS_PUBLISH: "assets.publish",
  NOTIFICATIONS_SINGLE_SEND: "notifications.single.send",
  NOTIFICATIONS_BULK_SEND: "notifications.bulk.send",
  SUPPORT_READ: "support.read",
  SUPPORT_MANAGE: "support.manage",
  OPERATIONS_READ: "operations.read",
  SYSTEM_READ: "system.read",
} as const;

export type AdminPermissionKey =
  (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

export interface AdminPermissionDefinition {
  key: AdminPermissionKey;
  description: string;
}

export const ADMIN_PERMISSION_DEFINITIONS: readonly AdminPermissionDefinition[] = [
  { key: ADMIN_PERMISSIONS.ACCESS, description: "Enter the Diewish Management Center." },
  { key: ADMIN_PERMISSIONS.SECURITY_READ, description: "Read Management Center security foundation details." },
  { key: ADMIN_PERMISSIONS.ACCESS_MANAGE, description: "Legacy access-management permission retained for existing staging administrators." },
  { key: ADMIN_PERMISSIONS.ROLES_READ, description: "Read Management Center roles and their permissions." },
  { key: ADMIN_PERMISSIONS.ROLES_MANAGE, description: "Create and manage Management Center roles and permission mappings." },
  { key: ADMIN_PERMISSIONS.STAFF_READ, description: "Read Management Center staff accounts and assigned roles." },
  { key: ADMIN_PERMISSIONS.STAFF_MANAGE, description: "Create and manage Management Center staff access." },
  { key: ADMIN_PERMISSIONS.AUDIT_READ, description: "Read append-only Management Center audit history." },
  { key: ADMIN_PERMISSIONS.LEGACY_AUDIT_READ, description: "Legacy audit-read permission retained during the Phase 2 transition." },
  { key: ADMIN_PERMISSIONS.USERS_READ, description: "Read non-sensitive user account summaries." },
  { key: ADMIN_PERMISSIONS.USERS_MANAGE, description: "Manage supported user account state operations." },
  { key: ADMIN_PERMISSIONS.USER_SESSIONS_REVOKE, description: "Revoke supported user sessions." },
  { key: ADMIN_PERMISSIONS.HEALTH_SUMMARY_READ, description: "Read aggregate health record counts and non-sensitive summaries." },
  { key: ADMIN_PERMISSIONS.HEALTH_SENSITIVE_READ, description: "Read explicitly authorized sensitive health data with audited reason." },
  { key: ADMIN_PERMISSIONS.ENTITLEMENTS_READ, description: "Read effective and source entitlement state." },
  { key: ADMIN_PERMISSIONS.ENTITLEMENTS_GRANT, description: "Grant supported manual entitlements." },
  { key: ADMIN_PERMISSIONS.ENTITLEMENTS_REVOKE, description: "Revoke supported manual entitlements." },
  { key: ADMIN_PERMISSIONS.FLAGS_READ, description: "Read feature flag configuration." },
  { key: ADMIN_PERMISSIONS.FLAGS_WRITE, description: "Change supported feature flag configuration." },
  { key: ADMIN_PERMISSIONS.CONTENT_READ, description: "Read managed content." },
  { key: ADMIN_PERMISSIONS.CONTENT_WRITE, description: "Edit managed content drafts." },
  { key: ADMIN_PERMISSIONS.CONTENT_PUBLISH, description: "Publish managed content." },
  { key: ADMIN_PERMISSIONS.ASSETS_READ, description: "Read managed assets and usage metadata." },
  { key: ADMIN_PERMISSIONS.ASSETS_WRITE, description: "Upload and edit managed assets." },
  { key: ADMIN_PERMISSIONS.ASSETS_PUBLISH, description: "Activate or roll back managed assets." },
  { key: ADMIN_PERMISSIONS.NOTIFICATIONS_SINGLE_SEND, description: "Send a notification to a single supported target." },
  { key: ADMIN_PERMISSIONS.NOTIFICATIONS_BULK_SEND, description: "Send approved bulk or campaign notifications." },
  { key: ADMIN_PERMISSIONS.SUPPORT_READ, description: "Read support tickets and non-sensitive support context." },
  { key: ADMIN_PERMISSIONS.SUPPORT_MANAGE, description: "Manage support ticket workflow." },
  { key: ADMIN_PERMISSIONS.OPERATIONS_READ, description: "Read Diewish operational telemetry." },
  { key: ADMIN_PERMISSIONS.SYSTEM_READ, description: "Read system health and runtime status." },
] as const;

export const ADMIN_SYSTEM_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN_STAFF: "ADMIN_STAFF",
  SUPPORT: "SUPPORT",
  CONTENT_MANAGER: "CONTENT_MANAGER",
  FINANCE: "FINANCE",
  OPERATIONS: "OPERATIONS",
} as const;

const allPermissions = ADMIN_PERMISSION_DEFINITIONS.map((permission) => permission.key);

export const ADMIN_ROLE_DEFINITIONS = [
  {
    key: ADMIN_SYSTEM_ROLES.SUPER_ADMIN,
    name: "Super Admin",
    description:
      "Full Management Center access. Critical mutations remain audited and environment-scoped.",
    permissions: allPermissions,
  },
  {
    key: ADMIN_SYSTEM_ROLES.ADMIN_STAFF,
    name: "Admin Staff",
    description:
      "Legacy limited-access role retained for existing staging administrators during the Phase 2 transition.",
    permissions: [ADMIN_PERMISSIONS.ACCESS],
  },
  {
    key: ADMIN_SYSTEM_ROLES.SUPPORT,
    name: "Support",
    description:
      "Support operations with non-sensitive user lookup, supported session revocation and ticket management.",
    permissions: [
      ADMIN_PERMISSIONS.ACCESS,
      ADMIN_PERMISSIONS.USERS_READ,
      ADMIN_PERMISSIONS.USER_SESSIONS_REVOKE,
      ADMIN_PERMISSIONS.HEALTH_SUMMARY_READ,
      ADMIN_PERMISSIONS.SUPPORT_READ,
      ADMIN_PERMISSIONS.SUPPORT_MANAGE,
    ],
  },
  {
    key: ADMIN_SYSTEM_ROLES.CONTENT_MANAGER,
    name: "Content Manager",
    description:
      "Managed content and asset operations without staff, finance or sensitive-health authority.",
    permissions: [
      ADMIN_PERMISSIONS.ACCESS,
      ADMIN_PERMISSIONS.CONTENT_READ,
      ADMIN_PERMISSIONS.CONTENT_WRITE,
      ADMIN_PERMISSIONS.CONTENT_PUBLISH,
      ADMIN_PERMISSIONS.ASSETS_READ,
      ADMIN_PERMISSIONS.ASSETS_WRITE,
      ADMIN_PERMISSIONS.ASSETS_PUBLISH,
    ],
  },
  {
    key: ADMIN_SYSTEM_ROLES.FINANCE,
    name: "Finance",
    description:
      "Subscription and entitlement operations with read-only user account context.",
    permissions: [
      ADMIN_PERMISSIONS.ACCESS,
      ADMIN_PERMISSIONS.USERS_READ,
      ADMIN_PERMISSIONS.ENTITLEMENTS_READ,
      ADMIN_PERMISSIONS.ENTITLEMENTS_GRANT,
      ADMIN_PERMISSIONS.ENTITLEMENTS_REVOKE,
    ],
  },
  {
    key: ADMIN_SYSTEM_ROLES.OPERATIONS,
    name: "Operations",
    description:
      "Operational health, feature configuration and runtime monitoring permissions.",
    permissions: [
      ADMIN_PERMISSIONS.ACCESS,
      ADMIN_PERMISSIONS.FLAGS_READ,
      ADMIN_PERMISSIONS.FLAGS_WRITE,
      ADMIN_PERMISSIONS.OPERATIONS_READ,
      ADMIN_PERMISSIONS.SYSTEM_READ,
    ],
  },
] as const;

const permissionKeys = new Set<string>(
  ADMIN_PERMISSION_DEFINITIONS.map((permission) => permission.key),
);

export function isAdminPermissionKey(value: string): value is AdminPermissionKey {
  return permissionKeys.has(value);
}
