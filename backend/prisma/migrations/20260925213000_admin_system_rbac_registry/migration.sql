-- Management Center system RBAC registry.
-- Additive and idempotent: existing administrators, memberships and custom
-- permissions are preserved. System definitions are reconciled by stable key.

INSERT INTO "admin_permissions" ("id", "key", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'admin.access', 'Enter the Diewish Management Center foundation.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'admin.security.read', 'Read Management Center access and security foundation details.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'admin.access.manage', 'Create Management Center staff accounts and change their access level.', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'admin.audit.read', 'Read append-only Management Center audit history.', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "admin_roles" (
  "id", "key", "name", "description", "isSystem", "createdAt", "updatedAt"
)
VALUES
  (
    gen_random_uuid()::text,
    'SUPER_ADMIN',
    'Super Admin',
    'Full Management Center foundation access. All mutations remain audited and environment-scoped.',
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid()::text,
    'ADMIN_STAFF',
    'Admin Staff',
    'Limited Management Center access. Cannot create administrators, change access levels or read audit history.',
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("key") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "isSystem" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "admin_role_permissions" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "admin_roles" role
JOIN "admin_permissions" permission
  ON permission."key" IN (
    'admin.access',
    'admin.security.read',
    'admin.access.manage',
    'admin.audit.read'
  )
WHERE role."key" = 'SUPER_ADMIN'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "admin_role_permissions" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "admin_roles" role
JOIN "admin_permissions" permission
  ON permission."key" = 'admin.access'
WHERE role."key" = 'ADMIN_STAFF'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
