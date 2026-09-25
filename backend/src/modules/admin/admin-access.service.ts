import crypto from "node:crypto";

import { AdminAuditRiskLevel, Prisma, UserRole } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { hashPassword } from "../../utils/password";
import {
  buildAuditSnapshot,
  runAuditedAdminMutation,
} from "./admin-audit.service";
import { resolveRuntimeEnvironment } from "./admin.environment";
import { ADMIN_SYSTEM_ROLES } from "./admin.permissions";
import type {
  AdminAccessLevel,
  AdminCreateAccessUserInput,
} from "./admin-access.schemas";

interface AdminMutationRequestContext {
  correlationId: string;
  requestId: string;
}

function roleKey(level: AdminAccessLevel): string {
  return level === "FULL"
    ? ADMIN_SYSTEM_ROLES.SUPER_ADMIN
    : ADMIN_SYSTEM_ROLES.ADMIN_STAFF;
}

function accessLevelFromRoles(roles: string[]): AdminAccessLevel {
  return roles.includes(ADMIN_SYSTEM_ROLES.SUPER_ADMIN) ? "FULL" : "LIMITED";
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const adminAccessService = {
  async listAdmins() {
    const users = await prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        adminRoleMemberships: {
          select: { role: { select: { key: true } } },
        },
      },
    });

    return users.map((user) => {
      const roles = user.adminRoleMemberships.map((membership) => membership.role.key);
      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        roles,
        accessLevel: accessLevelFromRoles(roles),
      };
    });
  },

  async createAdmin(
    actorAdminId: string,
    input: AdminCreateAccessUserInput,
    requestContext: AdminMutationRequestContext,
  ) {
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(input.temporaryPassword);
    const selectedRoleKey = roleKey(input.accessLevel);

    try {
      return await runAuditedAdminMutation(
        {
          actorAdminId,
          action: "admin.access.user_create",
          targetType: "user",
          targetId: id,
          reason: "Management Center staff account created",
          environment: resolveRuntimeEnvironment(),
          correlationId: requestContext.correlationId,
          requestId: requestContext.requestId,
          riskLevel: AdminAuditRiskLevel.HIGH,
        },
        async (tx) => {
          const existing = await tx.user.findUnique({
            where: { email: input.email },
            select: { id: true },
          });
          if (existing) {
            throw new ApiError(409, "This email address is already in use.", {
              code: "ADMIN_EMAIL_IN_USE",
            });
          }

          const role = await tx.adminRole.findUniqueOrThrow({
            where: { key: selectedRoleKey },
            select: { id: true },
          });
          const user = await tx.user.create({
            data: {
              id,
              email: input.email,
              passwordHash,
              fullName: input.fullName,
              role: UserRole.ADMIN,
              isActive: true,
            },
            select: {
              id: true,
              email: true,
              fullName: true,
              isActive: true,
              createdAt: true,
              lastLoginAt: true,
            },
          });
          await tx.adminUserRole.create({
            data: {
              userId: user.id,
              roleId: role.id,
              assignedByAdminId: actorAdminId,
            },
          });

          return {
            result: {
              ...user,
              createdAt: user.createdAt.toISOString(),
              lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
              roles: [selectedRoleKey],
              accessLevel: input.accessLevel,
            },
            after: buildAuditSnapshot(
              {
                email: user.email,
                fullName: user.fullName,
                accessLevel: input.accessLevel,
                isActive: user.isActive,
              },
              ["email", "fullName", "accessLevel", "isActive"],
            ),
          };
        },
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApiError(409, "This email address is already in use.", {
          code: "ADMIN_EMAIL_IN_USE",
        });
      }
      throw error;
    }
  },

  async updateAccessLevel(
    actorAdminId: string,
    targetUserId: string,
    accessLevel: AdminAccessLevel,
    requestContext: AdminMutationRequestContext,
  ) {
    if (actorAdminId === targetUserId) {
      throw new ApiError(400, "You cannot change your own access level.", {
        code: "ADMIN_SELF_ACCESS_CHANGE_BLOCKED",
      });
    }

    return runAuditedAdminMutation(
      {
        actorAdminId,
        action: "admin.access.level_change",
        targetType: "user",
        targetId: targetUserId,
        reason: "Management Center access level changed",
        environment: resolveRuntimeEnvironment(),
        correlationId: requestContext.correlationId,
        requestId: requestContext.requestId,
        riskLevel: AdminAuditRiskLevel.HIGH,
      },
      async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: targetUserId },
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            adminRoleMemberships: {
              select: { role: { select: { id: true, key: true } } },
            },
          },
        });
        if (!target || target.role !== UserRole.ADMIN) {
          throw new ApiError(404, "Administrator account not found.", {
            code: "ADMIN_ACCOUNT_NOT_FOUND",
          });
        }

        const currentRoles = target.adminRoleMemberships.map((membership) => membership.role.key);
        const nextRoleKey = roleKey(accessLevel);
        if (
          currentRoles.includes(ADMIN_SYSTEM_ROLES.SUPER_ADMIN) &&
          nextRoleKey !== ADMIN_SYSTEM_ROLES.SUPER_ADMIN
        ) {
          const superRole = await tx.adminRole.findUniqueOrThrow({
            where: { key: ADMIN_SYSTEM_ROLES.SUPER_ADMIN },
            select: { id: true },
          });
          const remainingSuperAdmins = await tx.adminUserRole.count({
            where: {
              roleId: superRole.id,
              userId: { not: targetUserId },
            },
          });
          if (remainingSuperAdmins === 0) {
            throw new ApiError(409, "The last Super Admin cannot be downgraded.", {
              code: "ADMIN_LAST_SUPER_ADMIN",
            });
          }
        }

        const managedRoles = await tx.adminRole.findMany({
          where: {
            key: {
              in: [ADMIN_SYSTEM_ROLES.SUPER_ADMIN, ADMIN_SYSTEM_ROLES.ADMIN_STAFF],
            },
          },
          select: { id: true, key: true },
        });
        await tx.adminUserRole.deleteMany({
          where: {
            userId: targetUserId,
            roleId: { in: managedRoles.map((role) => role.id) },
          },
        });
        const nextRole = managedRoles.find((role) => role.key === nextRoleKey);
        if (!nextRole) throw ApiError.internal("Admin access role is missing.");
        await tx.adminUserRole.create({
          data: {
            userId: targetUserId,
            roleId: nextRole.id,
            assignedByAdminId: actorAdminId,
          },
        });

        return {
          result: {
            id: target.id,
            email: target.email,
            accessLevel,
            roles: [nextRoleKey],
          },
          before: buildAuditSnapshot(
            { email: target.email, roles: currentRoles, accessLevel: accessLevelFromRoles(currentRoles) },
            ["email", "roles", "accessLevel"],
          ),
          after: buildAuditSnapshot(
            { email: target.email, roles: [nextRoleKey], accessLevel },
            ["email", "roles", "accessLevel"],
          ),
        };
      },
    );
  },

  async listAudit(limit = 100) {
    const events = await prisma.adminAuditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
    });
    const userIds = Array.from(
      new Set(
        events.flatMap((event) => [
          event.actorAdminId,
          ...(event.targetType === "user" ? [event.targetId] : []),
        ]),
      ),
    );
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, fullName: true },
    });
    const userMap = new Map(users.map((user) => [user.id, user]));

    return events.map((event) => ({
      id: event.id,
      actorAdminId: event.actorAdminId,
      actorEmail: userMap.get(event.actorAdminId)?.email ?? null,
      actorName: userMap.get(event.actorAdminId)?.fullName ?? null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      targetEmail:
        event.targetType === "user" ? userMap.get(event.targetId)?.email ?? null : null,
      beforeState: event.beforeState,
      afterState: event.afterState,
      reason: event.reason,
      environment: event.environment,
      riskLevel: event.riskLevel,
      createdAt: event.createdAt.toISOString(),
    }));
  },
};
