import { UserRole } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import {
  isAdminPermissionKey,
  type AdminPermissionKey,
} from "./admin.permissions";

export interface AdminAccessContext {
  user: {
    id: string;
    email: string;
    fullName: string | null;
  };
  roles: string[];
  permissions: AdminPermissionKey[];
}

/**
 * Resolves admin access from current database state. JWT role claims are only
 * the first boundary; permission decisions use fresh RBAC rows so revoked
 * permissions or a role downgrade take effect on the next request.
 */
export async function resolveAdminAccess(userId: string): Promise<AdminAccessContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      adminRoleMemberships: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive || user.role !== UserRole.ADMIN) return null;

  const roles = new Set<string>();
  const permissions = new Set<AdminPermissionKey>();
  for (const membership of user.adminRoleMemberships) {
    roles.add(membership.role.key);
    for (const mapping of membership.role.permissions) {
      if (isAdminPermissionKey(mapping.permission.key)) {
        permissions.add(mapping.permission.key);
      }
    }
  }

  return {
    user: { id: user.id, email: user.email, fullName: user.fullName },
    roles: [...roles].sort(),
    permissions: [...permissions].sort(),
  };
}
