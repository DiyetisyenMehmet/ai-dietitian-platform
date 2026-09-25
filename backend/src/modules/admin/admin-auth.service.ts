import crypto from "node:crypto";

import {
  AdminAuditRiskLevel,
  Prisma,
  UserRole,
  type User,
} from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { hashPassword } from "../../utils/password";
import { authRepository } from "../auth/auth.repository";
import {
  issueAuthSession,
  type AuthResult,
  type SessionContext,
} from "../auth/auth.service";
import { firebaseAuthProvider } from "../identity/firebase-auth.provider";
import {
  buildAuditSnapshot,
  runAuditedAdminMutation,
} from "./admin-audit.service";
import { resolveRuntimeEnvironment } from "./admin.environment";
import { ensureAdminFoundation } from "./admin.foundation";
import { ADMIN_PERMISSIONS, ADMIN_SYSTEM_ROLES } from "./admin.permissions";
import { resolveAdminAccess } from "./admin-rbac.repository";
import { adminPasswordIdentityProvider } from "./admin-password-identity.provider";

const APPROVED_FIRST_SUPER_ADMIN_EMAIL_SHA256 =
  "ed911dcbf3353a718ab0e6e3039e92287169025cb0a4609de03ade42a6463cb8";

interface AdminMutationRequestContext {
  correlationId: string;
  requestId: string;
}

function invalidAdminLogin(): ApiError {
  return new ApiError(401, "Management Center sign-in could not be verified.", {
    code: "ADMIN_AUTH_INVALID",
  });
}

function forbiddenAdminLogin(): ApiError {
  return new ApiError(403, "Management Center access is not authorized.", {
    code: "ADMIN_AUTH_FORBIDDEN",
  });
}

function invalidCurrentPassword(): ApiError {
  return new ApiError(401, "Current Management Center password could not be verified.", {
    code: "ADMIN_CURRENT_PASSWORD_INVALID",
  });
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function hasAdminAccess(user: User | null): Promise<boolean> {
  if (!user?.isActive || user.role !== UserRole.ADMIN) return false;
  const access = await resolveAdminAccess(user.id);
  return Boolean(access?.permissions.includes(ADMIN_PERMISSIONS.ACCESS));
}

async function hasPrimaryEmailAccess(user: User | null): Promise<boolean> {
  if (!(await hasAdminAccess(user)) || !user) return false;
  const access = await resolveAdminAccess(user.id);
  return Boolean(access?.roles.includes(ADMIN_SYSTEM_ROLES.SUPER_ADMIN));
}

async function assertAdminAccess(user: User): Promise<void> {
  if (!(await hasAdminAccess(user))) throw forbiddenAdminLogin();
}

async function assertPrimaryEmailAccess(user: User): Promise<void> {
  if (!(await hasPrimaryEmailAccess(user))) throw forbiddenAdminLogin();
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function requireAdmin(userId: string): Promise<User> {
  const user = await authRepository.findUserById(userId);
  if (!user) throw forbiddenAdminLogin();
  await assertAdminAccess(user);
  return user;
}

async function requirePrimaryAdmin(userId: string): Promise<User> {
  const user = await authRepository.findUserById(userId);
  if (!user) throw forbiddenAdminLogin();
  await assertPrimaryEmailAccess(user);
  return user;
}

async function reauthenticate(
  user: User,
  currentPassword: string,
): Promise<{ idToken: string }> {
  try {
    const identity = await adminPasswordIdentityProvider.signIn(
      user.email,
      currentPassword,
    );
    if (!identity.idToken) throw invalidCurrentPassword();
    return { idToken: identity.idToken };
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      throw invalidCurrentPassword();
    }
    throw error;
  }
}

export const adminAuthService = {
  async loginWithEmail(
    email: string,
    password: string,
    context: SessionContext,
  ): Promise<AuthResult> {
    let external;
    try {
      external = await adminPasswordIdentityProvider.signIn(email, password);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        throw invalidAdminLogin();
      }
      throw error;
    }

    const identity = await firebaseAuthProvider.verifyIdToken(external.idToken);
    if (!identity.email || identity.email.trim().toLowerCase() !== email) {
      throw invalidAdminLogin();
    }

    const user = await authRepository.findUserByEmail(email);
    if (!user) throw invalidAdminLogin();
    await assertAdminAccess(user);
    await authRepository.updateLastLogin(user.id);
    return issueAuthSession(user, context);
  },

  async requestFirstSuperAdminBootstrap(email: string): Promise<void> {
    const environment = resolveRuntimeEnvironment();
    if (environment !== "staging" && environment !== "test") {
      throw new ApiError(404, "Not found.", { code: "ADMIN_BOOTSTRAP_UNAVAILABLE" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    // Keep the response generic so the bootstrap endpoint never confirms the
    // approved owner address to an unauthenticated caller.
    if (sha256(normalizedEmail) !== APPROVED_FIRST_SUPER_ADMIN_EMAIL_SHA256) {
      return;
    }

    const setupAlreadyClosed = await prisma.adminAuditEvent.findFirst({
      where: { action: "admin.bootstrap.super_admin", environment },
      select: { id: true },
    });
    if (setupAlreadyClosed) return;

    const superRole = await prisma.adminRole.findUnique({
      where: { key: ADMIN_SYSTEM_ROLES.SUPER_ADMIN },
      select: { id: true },
    });
    if (
      superRole &&
      await prisma.adminUserRole.findFirst({
        where: { roleId: superRole.id },
        select: { userId: true },
      })
    ) {
      return;
    }

    const temporaryPassword =
      `${crypto.randomBytes(32).toString("base64url")}Aa1!`;
    let createdIdentity: { idToken: string } | null = null;

    try {
      createdIdentity = await adminPasswordIdentityProvider.createUser(
        normalizedEmail,
        temporaryPassword,
      );
    } catch (error) {
      if (!(error instanceof ApiError && error.code === "ADMIN_EMAIL_IN_USE")) {
        throw error;
      }
    }

    try {
      await adminPasswordIdentityProvider.sendPasswordReset(normalizedEmail);
    } catch (error) {
      if (createdIdentity?.idToken) {
        await adminPasswordIdentityProvider
          .deleteUser(createdIdentity.idToken)
          .catch(() => undefined);
      }
      throw error;
    }
  },

  async requestPasswordReset(email: string, _context: SessionContext): Promise<void> {
    const user = await authRepository.findUserByEmail(email);
    if (!user || !(await hasAdminAccess(user))) return;
    await adminPasswordIdentityProvider.sendPasswordReset(email);
  },

  async resetPassword(
    token: string,
    newPassword: string,
    _context: SessionContext,
  ): Promise<void> {
    const identity = await adminPasswordIdentityProvider.confirmPasswordReset(
      token,
      newPassword,
    );
    const email = identity.email?.trim().toLowerCase();
    if (!email) throw invalidAdminLogin();

    const passwordHash = await hashPassword(newPassword);
    const existingUser = await authRepository.findUserByEmail(email);
    if (existingUser && (await hasAdminAccess(existingUser))) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { passwordHash },
      });
      await authRepository.revokeAllForUser(existingUser.id);
      return;
    }

    const environment = resolveRuntimeEnvironment();
    const canCompleteOwnerBootstrap =
      (environment === "staging" || environment === "test") &&
      sha256(email) === APPROVED_FIRST_SUPER_ADMIN_EMAIL_SHA256;
    if (!canCompleteOwnerBootstrap) throw invalidAdminLogin();

    const user = await prisma.$transaction(async (tx) => {
      await ensureAdminFoundation(tx);

      const consumed = await tx.adminAuditEvent.findFirst({
        where: { action: "admin.bootstrap.super_admin", environment },
        select: { id: true },
      });
      if (consumed) throw invalidAdminLogin();

      const superRole = await tx.adminRole.findUniqueOrThrow({
        where: { key: ADMIN_SYSTEM_ROLES.SUPER_ADMIN },
        select: { id: true },
      });
      const existingSuperAdmin = await tx.adminUserRole.findFirst({
        where: { roleId: superRole.id },
        select: { userId: true },
      });
      if (existingSuperAdmin) throw invalidAdminLogin();

      const current = await tx.user.findUnique({ where: { email } });
      const next = current
        ? await tx.user.update({
            where: { id: current.id },
            data: {
              passwordHash,
              role: UserRole.ADMIN,
              isActive: true,
              emailVerifiedAt: new Date(),
              deletionRequestedAt: null,
            },
          })
        : await tx.user.create({
            data: {
              email,
              passwordHash,
              role: UserRole.ADMIN,
              isActive: true,
              emailVerifiedAt: new Date(),
            },
          });

      await tx.adminUserRole.upsert({
        where: { userId_roleId: { userId: next.id, roleId: superRole.id } },
        update: { assignedByAdminId: next.id },
        create: {
          userId: next.id,
          roleId: superRole.id,
          assignedByAdminId: next.id,
        },
      });

      await tx.adminAuditEvent.create({
        data: {
          actorAdminId: next.id,
          action: "admin.bootstrap.super_admin",
          targetType: "user",
          targetId: next.id,
          beforeState: current
            ? { role: current.role, isActive: current.isActive }
            : undefined,
          afterState: {
            role: UserRole.ADMIN,
            assignedRole: ADMIN_SYSTEM_ROLES.SUPER_ADMIN,
          },
          reason: "Verified owner email bootstrap completed through password setup link",
          environment,
          correlationId: "owner-email-bootstrap",
          requestId: "owner-email-bootstrap",
          riskLevel: AdminAuditRiskLevel.CRITICAL,
        },
      });

      return next;
    });

    await authRepository.revokeAllForUser(user.id);
  },

  async changePrimaryEmail(
    userId: string,
    currentPassword: string,
    newEmail: string,
    sessionContext: SessionContext,
    requestContext: AdminMutationRequestContext,
  ): Promise<AuthResult> {
    const user = await requirePrimaryAdmin(userId);
    const reauth = await reauthenticate(user, currentPassword);
    if (newEmail === user.email) return issueAuthSession(user, sessionContext);

    const conflictingUser = await authRepository.findUserByEmail(newEmail);
    if (conflictingUser && conflictingUser.id !== user.id) {
      throw new ApiError(409, "This email address is already in use.", {
        code: "ADMIN_EMAIL_IN_USE",
      });
    }

    const externalUpdate = await adminPasswordIdentityProvider.updateEmail(
      reauth.idToken,
      newEmail,
    );

    let updated: User;
    try {
      updated = await runAuditedAdminMutation(
        {
          actorAdminId: user.id,
          action: "admin.security.email_change",
          targetType: "user",
          targetId: user.id,
          reason: "Authenticated Management Center self-service email change",
          environment: resolveRuntimeEnvironment(),
          correlationId: requestContext.correlationId,
          requestId: requestContext.requestId,
          riskLevel: AdminAuditRiskLevel.HIGH,
        },
        async (tx) => {
          const conflicting = await tx.user.findUnique({
            where: { email: newEmail },
            select: { id: true },
          });
          if (conflicting && conflicting.id !== user.id) {
            throw new ApiError(409, "This email address is already in use.", {
              code: "ADMIN_EMAIL_IN_USE",
            });
          }
          const next = await tx.user.update({
            where: { id: user.id },
            data: { email: newEmail, emailVerifiedAt: null },
          });
          return {
            result: next,
            before: buildAuditSnapshot({ email: user.email }, ["email"]),
            after: buildAuditSnapshot({ email: next.email }, ["email"]),
          };
        },
      );
    } catch (error) {
      try {
        if (externalUpdate.idToken) {
          await adminPasswordIdentityProvider.updateEmail(
            externalUpdate.idToken,
            user.email,
          );
        }
      } catch {
        // The primary error is preserved; compensation failure is handled by
        // the next authenticated support operation and never exposes secrets.
      }
      if (isUniqueConstraintError(error)) {
        throw new ApiError(409, "This email address is already in use.", {
          code: "ADMIN_EMAIL_IN_USE",
        });
      }
      throw error;
    }

    await authRepository.revokeAllForUser(user.id);
    return issueAuthSession(updated, sessionContext);
  },

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    sessionContext: SessionContext,
    requestContext: AdminMutationRequestContext,
  ): Promise<AuthResult> {
    const user = await requireAdmin(userId);
    const reauth = await reauthenticate(user, currentPassword);
    if (newPassword === currentPassword) {
      throw new ApiError(400, "New password must be different from the current password.", {
        code: "ADMIN_PASSWORD_REUSE",
      });
    }

    const externalUpdate = await adminPasswordIdentityProvider.updatePassword(
      reauth.idToken,
      newPassword,
    );
    const passwordHash = await hashPassword(newPassword);

    let updated: User;
    try {
      updated = await runAuditedAdminMutation(
      {
        actorAdminId: user.id,
        action: "admin.security.password_change",
        targetType: "user",
        targetId: user.id,
        reason: "Authenticated Management Center self-service password change",
        environment: resolveRuntimeEnvironment(),
        correlationId: requestContext.correlationId,
        requestId: requestContext.requestId,
        riskLevel: AdminAuditRiskLevel.HIGH,
      },
      async (tx) => {
        const next = await tx.user.update({
          where: { id: user.id },
          data: { passwordHash },
        });
        return { result: next };
      },
      );
    } catch (error) {
      try {
        if (externalUpdate.idToken) {
          await adminPasswordIdentityProvider.updatePassword(
            externalUpdate.idToken,
            currentPassword,
          );
        }
      } catch {
        // Preserve the audited Diewish mutation failure as the primary error.
      }
      throw error;
    }

    await authRepository.revokeAllForUser(user.id);
    return issueAuthSession(updated, sessionContext);
  },
};
