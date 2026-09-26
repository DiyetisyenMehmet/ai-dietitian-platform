import crypto from "node:crypto";

import {
  AdminAuditRiskLevel,
  Prisma,
  UserRole,
} from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { hashPassword } from "../../utils/password";
import {
  buildAuditSnapshot,
  runAuditedAdminMutation,
} from "./admin-audit.service";
import { resolveRuntimeEnvironment } from "./admin.environment";
import {
  ADMIN_PERMISSIONS,
  isAdminPermissionKey,
} from "./admin.permissions";
import { adminPasswordIdentityProvider } from "./admin-password-identity.provider";
import type {
  AdminAuditQueryInput,
  AdminInvitationCreateInput,
  AdminRoleCreateInput,
  AdminRoleUpdateInput,
} from "./admin-governance.schemas";

interface RequestIdentity {
  correlationId: string;
  requestId: string;
}

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

function customRoleKey(name: string): string {
  const normalized = name
    .trim()
    .toUpperCase()
    .replace(/İ/g, "I")
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  if (!normalized) {
    throw new ApiError(422, "Role name cannot be converted to a valid key.", {
      code: "ADMIN_ROLE_NAME_INVALID",
    });
  }
  return `CUSTOM_${normalized}`;
}

function uniqueRoleKeys(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()))].sort();
}

async function loadAssignableRoles(
  tx: Prisma.TransactionClient,
  roleKeys: string[],
) {
  const unique = uniqueRoleKeys(roleKeys);
  const roles = await tx.adminRole.findMany({
    where: { key: { in: unique } },
    include: {
      permissions: {
        include: { permission: true },
      },
    },
  });
  if (roles.length !== unique.length) {
    throw new ApiError(400, "One or more administrator roles are invalid.", {
      code: "ADMIN_ROLE_INVALID",
    });
  }
  const grantsAccess = roles.some((role) =>
    role.permissions.some(
      (mapping) => mapping.permission.key === ADMIN_PERMISSIONS.ACCESS,
    ),
  );
  if (!grantsAccess) {
    throw new ApiError(400, "At least one selected role must allow Management Center access.", {
      code: "ADMIN_ROLE_ACCESS_REQUIRED",
    });
  }
  return roles;
}

async function loadPermissionRows(
  tx: Prisma.TransactionClient,
  permissionKeys: string[],
) {
  const requested = [...new Set([ADMIN_PERMISSIONS.ACCESS, ...permissionKeys])].sort();
  if (!requested.every(isAdminPermissionKey)) {
    throw new ApiError(400, "One or more permissions are invalid.", {
      code: "ADMIN_PERMISSION_INVALID",
    });
  }
  const permissions = await tx.adminPermission.findMany({
    where: { key: { in: requested } },
    select: { id: true, key: true },
  });
  if (permissions.length !== requested.length) {
    throw ApiError.internal("Administrator permission registry is incomplete.");
  }
  return permissions;
}

function ensureAdminTarget(
  user: { role: UserRole; id: string } | null,
): asserts user is { role: UserRole; id: string } {
  if (!user || user.role !== UserRole.ADMIN) {
    throw new ApiError(404, "Administrator account not found.", {
      code: "ADMIN_ACCOUNT_NOT_FOUND",
    });
  }
}

function identityConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === "ADMIN_EMAIL_IN_USE";
}

export const adminGovernanceService = {
  async listInvitations() {
    const invitations = await prisma.adminInvitation.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: {
          select: {
            fullName: true,
            isActive: true,
            adminRoleMemberships: {
              select: { role: { select: { key: true, name: true } } },
            },
          },
        },
        invitedBy: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });

    return invitations.map((invitation) => ({
      id: invitation.id,
      userId: invitation.userId,
      email: invitation.email,
      fullName: invitation.user.fullName,
      roles: invitation.user.adminRoleMemberships.map((membership) => ({
        key: membership.role.key,
        name: membership.role.name,
      })),
      isActive: invitation.user.isActive,
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
      revokedAt: invitation.revokedAt?.toISOString() ?? null,
      createdAt: invitation.createdAt.toISOString(),
      invitedBy: {
        id: invitation.invitedBy.id,
        email: invitation.invitedBy.email,
        fullName: invitation.invitedBy.fullName,
      },
    }));
  },

  async inviteStaff(
    actorAdminId: string,
    input: AdminInvitationCreateInput,
    requestIdentity: RequestIdentity,
  ) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(409, "This email address is already in use.", {
        code: "ADMIN_EMAIL_IN_USE",
      });
    }

    const roleKeys = uniqueRoleKeys(input.roleKeys);
    await prisma.$transaction(async (tx) => {
      await loadAssignableRoles(tx, roleKeys);
    });

    const userId = crypto.randomUUID();
    const invitationId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const providerOnlyPassword = `${crypto.randomBytes(32).toString("base64url")}Aa1!`;
    const passwordHash = await hashPassword(providerOnlyPassword);

    let externalIdentity: { idToken: string } | null = null;
    try {
      externalIdentity = await adminPasswordIdentityProvider.createUser(
        input.email,
        providerOnlyPassword,
      );
      await adminPasswordIdentityProvider.sendPasswordReset(input.email);
    } catch (error) {
      if (externalIdentity?.idToken) {
        await adminPasswordIdentityProvider
          .deleteUser(externalIdentity.idToken)
          .catch(() => undefined);
      }
      if (identityConflict(error)) {
        throw new ApiError(409, "This email address is already in use.", {
          code: "ADMIN_EMAIL_IN_USE",
        });
      }
      throw error;
    }

    try {
      return await runAuditedAdminMutation(
        {
          actorAdminId,
          action: "admin.staff.invite_create",
          targetType: "user",
          targetId: userId,
          reason: input.reason,
          environment: resolveRuntimeEnvironment(),
          correlationId: requestIdentity.correlationId,
          requestId: requestIdentity.requestId,
          riskLevel: AdminAuditRiskLevel.HIGH,
        },
        async (tx) => {
          const duplicate = await tx.user.findUnique({
            where: { email: input.email },
            select: { id: true },
          });
          if (duplicate) {
            throw new ApiError(409, "This email address is already in use.", {
              code: "ADMIN_EMAIL_IN_USE",
            });
          }

          const roles = await loadAssignableRoles(tx, roleKeys);
          const user = await tx.user.create({
            data: {
              id: userId,
              email: input.email,
              fullName: input.fullName,
              passwordHash,
              role: UserRole.ADMIN,
              isActive: false,
            },
          });
          await tx.adminUserRole.createMany({
            data: roles.map((role) => ({
              userId,
              roleId: role.id,
              assignedByAdminId: actorAdminId,
            })),
          });
          const invitation = await tx.adminInvitation.create({
            data: {
              id: invitationId,
              userId,
              invitedByAdminId: actorAdminId,
              email: input.email,
              expiresAt,
            },
          });

          return {
            result: {
              id: invitation.id,
              userId,
              email: user.email,
              fullName: user.fullName,
              roles: roleKeys,
              isActive: false,
              expiresAt: invitation.expiresAt.toISOString(),
            },
            after: buildAuditSnapshot(
              {
                email: user.email,
                fullName: user.fullName,
                roles: roleKeys,
                isActive: false,
                expiresAt: invitation.expiresAt.toISOString(),
              },
              ["email", "fullName", "roles", "isActive", "expiresAt"],
            ),
          };
        },
      );
    } catch (error) {
      if (externalIdentity?.idToken) {
        await adminPasswordIdentityProvider
          .deleteUser(externalIdentity.idToken)
          .catch(() => undefined);
      }
      throw error;
    }
  },

  async listPermissions() {
    const permissions = await prisma.adminPermission.findMany({
      orderBy: { key: "asc" },
      select: { key: true, description: true },
    });
    return permissions.filter((permission) => isAdminPermissionKey(permission.key));
  },

  async createCustomRole(
    actorAdminId: string,
    input: AdminRoleCreateInput,
    requestIdentity: RequestIdentity,
  ) {
    const key = customRoleKey(input.name);
    const roleId = crypto.randomUUID();

    try {
      return await runAuditedAdminMutation(
        {
          actorAdminId,
          action: "admin.roles.custom_create",
          targetType: "admin_role",
          targetId: roleId,
          reason: input.reason,
          environment: resolveRuntimeEnvironment(),
          correlationId: requestIdentity.correlationId,
          requestId: requestIdentity.requestId,
          riskLevel: AdminAuditRiskLevel.HIGH,
        },
        async (tx) => {
          const permissions = await loadPermissionRows(tx, input.permissionKeys);
          const role = await tx.adminRole.create({
            data: {
              id: roleId,
              key,
              name: input.name,
              description: input.description,
              isSystem: false,
            },
          });
          await tx.adminRolePermission.createMany({
            data: permissions.map((permission) => ({
              roleId: role.id,
              permissionId: permission.id,
            })),
          });

          const permissionKeys = permissions.map((permission) => permission.key).sort();
          return {
            result: {
              key: role.key,
              name: role.name,
              description: role.description,
              isSystem: role.isSystem,
              permissions: permissionKeys,
            },
            after: buildAuditSnapshot(
              {
                key: role.key,
                name: role.name,
                permissions: permissionKeys,
              },
              ["key", "name", "permissions"],
            ),
          };
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ApiError(409, "A role with this name already exists.", {
          code: "ADMIN_ROLE_EXISTS",
        });
      }
      throw error;
    }
  },

  async updateCustomRole(
    actorAdminId: string,
    key: string,
    input: AdminRoleUpdateInput,
    requestIdentity: RequestIdentity,
  ) {
    const current = await prisma.adminRole.findUnique({
      where: { key },
      include: {
        permissions: { include: { permission: true } },
      },
    });
    if (!current) {
      throw new ApiError(404, "Administrator role not found.", {
        code: "ADMIN_ROLE_NOT_FOUND",
      });
    }
    if (current.isSystem) {
      throw new ApiError(409, "System roles cannot be edited here.", {
        code: "ADMIN_SYSTEM_ROLE_LOCKED",
      });
    }

    return runAuditedAdminMutation(
      {
        actorAdminId,
        action: "admin.roles.custom_update",
        targetType: "admin_role",
        targetId: current.id,
        reason: input.reason,
        environment: resolveRuntimeEnvironment(),
        correlationId: requestIdentity.correlationId,
        requestId: requestIdentity.requestId,
        riskLevel: AdminAuditRiskLevel.HIGH,
      },
      async (tx) => {
        const permissions = await loadPermissionRows(tx, input.permissionKeys);
        const latest = await tx.adminRole.findUniqueOrThrow({
          where: { key },
          include: {
            permissions: { include: { permission: true } },
          },
        });
        if (latest.isSystem) {
          throw new ApiError(409, "System roles cannot be edited here.", {
            code: "ADMIN_SYSTEM_ROLE_LOCKED",
          });
        }

        const role = await tx.adminRole.update({
          where: { id: latest.id },
          data: {
            name: input.name,
            description: input.description,
          },
        });
        await tx.adminRolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.adminRolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
        });

        const beforePermissions = latest.permissions
          .map((mapping) => mapping.permission.key)
          .sort();
        const afterPermissions = permissions.map((permission) => permission.key).sort();
        return {
          result: {
            key: role.key,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            permissions: afterPermissions,
          },
          before: buildAuditSnapshot(
            {
              key: latest.key,
              name: latest.name,
              permissions: beforePermissions,
            },
            ["key", "name", "permissions"],
          ),
          after: buildAuditSnapshot(
            {
              key: role.key,
              name: role.name,
              permissions: afterPermissions,
            },
            ["key", "name", "permissions"],
          ),
        };
      },
    );
  },

  async listStaffSessions(targetUserId: string) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });
    ensureAdminTarget(target);

    const now = new Date();
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
        userAgent: true,
        ipAddress: true,
      },
    });
    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: session.revokedAt?.toISOString() ?? null,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      isActive: session.revokedAt === null && session.expiresAt > now,
    }));
  },

  async revokeStaffSession(
    actorAdminId: string,
    targetUserId: string,
    sessionId: string,
    reason: string,
    requestIdentity: RequestIdentity,
  ) {
    return runAuditedAdminMutation(
      {
        actorAdminId,
        action: "admin.staff.session_revoke",
        targetType: "admin_session",
        targetId: sessionId,
        reason,
        environment: resolveRuntimeEnvironment(),
        correlationId: requestIdentity.correlationId,
        requestId: requestIdentity.requestId,
        riskLevel: AdminAuditRiskLevel.HIGH,
      },
      async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: targetUserId },
          select: { id: true, role: true, email: true },
        });
        ensureAdminTarget(target);
        const session = await tx.refreshToken.findFirst({
          where: { id: sessionId, userId: targetUserId },
        });
        if (!session) {
          throw new ApiError(404, "Administrator session not found.", {
            code: "ADMIN_SESSION_NOT_FOUND",
          });
        }
        const wasActive = session.revokedAt === null && session.expiresAt > new Date();
        if (session.revokedAt === null) {
          await tx.refreshToken.update({
            where: { id: session.id },
            data: { revokedAt: new Date() },
          });
        }
        return {
          result: { id: session.id, revoked: wasActive },
          before: buildAuditSnapshot(
            { userId: target.id, email: target.email, active: wasActive },
            ["userId", "email", "active"],
          ),
          after: buildAuditSnapshot(
            { userId: target.id, email: target.email, active: false },
            ["userId", "email", "active"],
          ),
        };
      },
    );
  },

  async revokeAllStaffSessions(
    actorAdminId: string,
    targetUserId: string,
    reason: string,
    requestIdentity: RequestIdentity,
  ) {
    return runAuditedAdminMutation(
      {
        actorAdminId,
        action: "admin.staff.sessions_revoke_all",
        targetType: "user",
        targetId: targetUserId,
        reason,
        environment: resolveRuntimeEnvironment(),
        correlationId: requestIdentity.correlationId,
        requestId: requestIdentity.requestId,
        riskLevel: AdminAuditRiskLevel.HIGH,
      },
      async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: targetUserId },
          select: { id: true, role: true, email: true },
        });
        ensureAdminTarget(target);
        const activeCount = await tx.refreshToken.count({
          where: {
            userId: targetUserId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        await tx.refreshToken.updateMany({
          where: { userId: targetUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return {
          result: { revokedCount: activeCount },
          before: buildAuditSnapshot(
            { userId: target.id, email: target.email, activeSessions: activeCount },
            ["userId", "email", "activeSessions"],
          ),
          after: buildAuditSnapshot(
            { userId: target.id, email: target.email, activeSessions: 0 },
            ["userId", "email", "activeSessions"],
          ),
        };
      },
    );
  },

  async listAudit(input: AdminAuditQueryInput) {
    const and: Prisma.AdminAuditEventWhereInput[] = [];

    if (input.admin) {
      const actors = await prisma.user.findMany({
        where: {
          OR: [
            { id: input.admin },
            { email: { contains: input.admin, mode: "insensitive" } },
            { fullName: { contains: input.admin, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 50,
      });
      if (actors.length === 0) return [];
      and.push({ actorAdminId: { in: actors.map((actor) => actor.id) } });
    }

    if (input.user) {
      const targets = await prisma.user.findMany({
        where: {
          OR: [
            { id: input.user },
            { email: { contains: input.user, mode: "insensitive" } },
            { fullName: { contains: input.user, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 50,
      });
      if (targets.length === 0) return [];
      and.push({
        targetType: "user",
        targetId: { in: targets.map((target) => target.id) },
      });
    }

    if (input.action) {
      and.push({ action: { contains: input.action, mode: "insensitive" } });
    }
    if (input.module) {
      and.push({ action: { contains: `.${input.module}.`, mode: "insensitive" } });
    }
    if (input.risk) {
      and.push({ riskLevel: input.risk });
    }
    if (input.environment) {
      and.push({ environment: input.environment });
    }
    if (input.dateFrom || input.dateTo) {
      and.push({
        createdAt: {
          ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
          ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}),
        },
      });
    }

    const events = await prisma.adminAuditEvent.findMany({
      where: and.length ? { AND: and } : undefined,
      orderBy: { createdAt: "desc" },
      take: input.limit,
    });
    const userIds = [
      ...new Set(
        events.flatMap((event) => [
          event.actorAdminId,
          ...(event.targetType === "user" ? [event.targetId] : []),
        ]),
      ),
    ];
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
      module: event.action.split(".")[1] ?? event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      targetEmail:
        event.targetType === "user"
          ? userMap.get(event.targetId)?.email ?? null
          : null,
      beforeState: event.beforeState,
      afterState: event.afterState,
      reason: event.reason,
      environment: event.environment,
      correlationId: event.correlationId,
      requestId: event.requestId,
      riskLevel: event.riskLevel,
      createdAt: event.createdAt.toISOString(),
    }));
  },
};
