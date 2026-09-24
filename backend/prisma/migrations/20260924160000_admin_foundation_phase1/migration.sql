-- Phase 1 Management Center foundation. Additive only.
CREATE TYPE "AdminAuditRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE "admin_roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

CREATE TABLE "admin_user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

CREATE TABLE "admin_audit_events" (
    "id" TEXT NOT NULL,
    "actorAdminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "reason" TEXT,
    "environment" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "riskLevel" "AdminAuditRiskLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_roles_key_key" ON "admin_roles"("key");
CREATE UNIQUE INDEX "admin_permissions_key_key" ON "admin_permissions"("key");
CREATE INDEX "admin_role_permissions_permissionId_idx" ON "admin_role_permissions"("permissionId");
CREATE INDEX "admin_user_roles_roleId_idx" ON "admin_user_roles"("roleId");
CREATE INDEX "admin_audit_events_actorAdminId_createdAt_idx" ON "admin_audit_events"("actorAdminId", "createdAt");
CREATE INDEX "admin_audit_events_action_createdAt_idx" ON "admin_audit_events"("action", "createdAt");
CREATE INDEX "admin_audit_events_targetType_targetId_createdAt_idx" ON "admin_audit_events"("targetType", "targetId", "createdAt");
CREATE INDEX "admin_audit_events_correlationId_idx" ON "admin_audit_events"("correlationId");

ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "admin_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
