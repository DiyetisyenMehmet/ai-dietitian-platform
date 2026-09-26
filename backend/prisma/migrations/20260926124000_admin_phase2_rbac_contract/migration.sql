-- Phase 2 Management Center RBAC contract.
-- Additive only. Existing custom roles, memberships and legacy permissions are preserved.

INSERT INTO "admin_permissions" ("id", "key", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'admin.roles.read', 'Read Management Center roles and their permissions.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'admin.roles.manage', 'Create and manage Management Center roles and permission mappings.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'admin.staff.read', 'Read Management Center staff accounts and assigned roles.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'admin.staff.manage', 'Create and manage Management Center staff access.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'audit.read', 'Read append-only Management Center audit history.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'users.read', 'Read non-sensitive user account summaries.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'users.manage', 'Manage supported user account state operations.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'users.sessions.revoke', 'Revoke supported user sessions.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'health.summary.read', 'Read aggregate health record counts and non-sensitive summaries.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'health.sensitive.read', 'Read explicitly authorized sensitive health data with audited reason.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'entitlements.read', 'Read effective and source entitlement state.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'entitlements.grant', 'Grant supported manual entitlements.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'entitlements.revoke', 'Revoke supported manual entitlements.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'flags.read', 'Read feature flag configuration.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'flags.write', 'Change supported feature flag configuration.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'content.read', 'Read managed content.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'content.write', 'Edit managed content drafts.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'content.publish', 'Publish managed content.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'assets.read', 'Read managed assets and usage metadata.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'assets.write', 'Upload and edit managed assets.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'assets.publish', 'Activate or roll back managed assets.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'notifications.single.send', 'Send a notification to a single supported target.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'notifications.bulk.send', 'Send approved bulk or campaign notifications.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'support.read', 'Read support tickets and non-sensitive support context.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'support.manage', 'Manage support ticket workflow.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'operations.read', 'Read Diewish operational telemetry.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'system.read', 'Read system health and runtime status.', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "admin_roles" (
  "id", "key", "name", "description", "isSystem", "createdAt", "updatedAt"
)
VALUES
  (gen_random_uuid()::text, 'SUPPORT', 'Support', 'Support operations with non-sensitive user lookup, supported session revocation and ticket management.', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CONTENT_MANAGER', 'Content Manager', 'Managed content and asset operations without staff, finance or sensitive-health authority.', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FINANCE', 'Finance', 'Subscription and entitlement operations with read-only user account context.', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'OPERATIONS', 'Operations', 'Operational health, feature configuration and runtime monitoring permissions.', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "isSystem" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "admin_role_permissions" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "admin_roles" role
JOIN "admin_permissions" permission ON TRUE
WHERE role."key" = 'SUPER_ADMIN'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "admin_role_permissions" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "admin_roles" role
JOIN "admin_permissions" permission
  ON permission."key" IN (
    'admin.access',
    'users.read',
    'users.sessions.revoke',
    'health.summary.read',
    'support.read',
    'support.manage'
  )
WHERE role."key" = 'SUPPORT'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "admin_role_permissions" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "admin_roles" role
JOIN "admin_permissions" permission
  ON permission."key" IN (
    'admin.access',
    'content.read',
    'content.write',
    'content.publish',
    'assets.read',
    'assets.write',
    'assets.publish'
  )
WHERE role."key" = 'CONTENT_MANAGER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "admin_role_permissions" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "admin_roles" role
JOIN "admin_permissions" permission
  ON permission."key" IN (
    'admin.access',
    'users.read',
    'entitlements.read',
    'entitlements.grant',
    'entitlements.revoke'
  )
WHERE role."key" = 'FINANCE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "admin_role_permissions" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "admin_roles" role
JOIN "admin_permissions" permission
  ON permission."key" IN (
    'admin.access',
    'flags.read',
    'flags.write',
    'operations.read',
    'system.read'
  )
WHERE role."key" = 'OPERATIONS'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
