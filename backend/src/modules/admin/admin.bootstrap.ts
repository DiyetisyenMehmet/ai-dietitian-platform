import { UserRole } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { buildAuditSnapshot, runAuditedAdminMutation } from "./admin-audit.service";
import { resolveRuntimeEnvironment } from "./admin.environment";
import { ensureAdminFoundation } from "./admin.foundation";
import { ADMIN_SYSTEM_ROLES } from "./admin.permissions";

const BOOTSTRAP_CONFIRMATION = "DIEWISH_STAGING_ADMIN_BOOTSTRAP";

export async function bootstrapAdminFoundation(): Promise<void> {
  await prisma.$transaction((tx) => ensureAdminFoundation(tx));
}

/**
 * Explicit non-production first-admin bootstrap. It is a CLI operation, not an
 * HTTP endpoint, and requires both a concrete user ID and confirmation token.
 */
export async function bootstrapStagingSuperAdmin(userId: string): Promise<void> {
  const environment = resolveRuntimeEnvironment();
  if (environment === "production") {
    throw new Error("Phase 1 bootstrap is disabled in production.");
  }

  await bootstrapAdminFoundation();
  const superRole = await prisma.adminRole.findUniqueOrThrow({
    where: { key: ADMIN_SYSTEM_ROLES.SUPER_ADMIN },
  });

  await runAuditedAdminMutation(
    {
      actorAdminId: userId,
      action: "admin.bootstrap.super_admin",
      targetType: "user",
      targetId: userId,
      reason: "Explicit non-production Management Center bootstrap",
      environment,
      correlationId: "bootstrap",
      requestId: "bootstrap",
      riskLevel: "HIGH",
    },
    async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || !user.isActive) {
        throw new Error("Bootstrap user must exist and be active.");
      }

      await tx.user.update({ where: { id: userId }, data: { role: UserRole.ADMIN } });
      await tx.adminUserRole.upsert({
        where: { userId_roleId: { userId, roleId: superRole.id } },
        update: { assignedByAdminId: userId },
        create: { userId, roleId: superRole.id, assignedByAdminId: userId },
      });

      return {
        result: undefined,
        before: buildAuditSnapshot(
          { role: user.role, isActive: user.isActive },
          ["role", "isActive"],
        ),
        after: buildAuditSnapshot(
          { role: UserRole.ADMIN, assignedRole: ADMIN_SYSTEM_ROLES.SUPER_ADMIN },
          ["role", "assignedRole"],
        ),
      };
    },
  );
}

async function main(): Promise<void> {
  if (resolveRuntimeEnvironment() === "production") {
    throw new Error("Phase 1 admin bootstrap refuses to mutate production.");
  }

  await bootstrapAdminFoundation();
  const userId = process.env.ADMIN_BOOTSTRAP_USER_ID?.trim();
  if (!userId) return;

  if (process.env.ADMIN_BOOTSTRAP_CONFIRM !== BOOTSTRAP_CONFIRMATION) {
    throw new Error(
      `ADMIN_BOOTSTRAP_CONFIRM must equal ${BOOTSTRAP_CONFIRMATION} before assigning a Super Admin.`,
    );
  }
  await bootstrapStagingSuperAdmin(userId);
}

const invokedPath = process.argv[1] ?? "";
if (/admin\.bootstrap\.(ts|js)$/.test(invokedPath)) {
  void main()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      await prisma.$disconnect();
      process.exitCode = 1;
    });
}
