import type { Prisma } from "@prisma/client";

import {
  ADMIN_PERMISSION_DEFINITIONS,
  ADMIN_ROLE_DEFINITIONS,
} from "./admin.permissions";

/**
 * Deterministically ensures the Phase 1 RBAC registry exists.
 *
 * The caller owns the transaction/client lifecycle. Keeping this function free
 * of runtime config imports lets migration/build tooling seed the registry with
 * DB-only credentials instead of exposing unrelated application secrets.
 */
export async function ensureAdminFoundation(
  tx: Prisma.TransactionClient,
): Promise<void> {
  for (const definition of ADMIN_PERMISSION_DEFINITIONS) {
    await tx.adminPermission.upsert({
      where: { key: definition.key },
      update: { description: definition.description },
      create: definition,
    });
  }

  for (const roleDefinition of ADMIN_ROLE_DEFINITIONS) {
    const role = await tx.adminRole.upsert({
      where: { key: roleDefinition.key },
      update: {
        name: roleDefinition.name,
        description: roleDefinition.description,
        isSystem: true,
      },
      create: {
        key: roleDefinition.key,
        name: roleDefinition.name,
        description: roleDefinition.description,
        isSystem: true,
      },
    });

    for (const permissionKey of roleDefinition.permissions) {
      const permission = await tx.adminPermission.findUniqueOrThrow({
        where: { key: permissionKey },
      });
      await tx.adminRolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
}
