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
const STAGING_OWNER_BOOTSTRAP_CODE_SHA256 =
  "24ad9a7e6f01bd24bb9afd5d7e2e3c5cae53c8ca6bd73b4fc95a632de51c47ef";

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

function expectedBootstrapCodeHash(): string {
  const testOverride =
    process.env.NODE_ENV === "test"
      ? process.env.ADMIN_BOOTSTRAP_CODE_SHA256?.trim().toLowerCase()
      : undefined;
  return testOverride && /^[a-f0-9]{64}$/.test(testOverride)
    ? testOverride
    : STAGING_OWNER_BOOTSTRAP_CODE_SHA256;
}

function bootstrapCodeMatches(value: string): boolean {
  const actual = Buffer.from(sha256(value.trim()), "hex");
  const expected = Buffer.from(expectedBootstrapCodeHash(), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
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

  async bootstrapFirstSuperAdmin(
    email: string,
    password: string,
    bootstrapCode: string,
    context: SessionContext,
    requestContext: AdminMutationRequestContext,
  ): Promise<AuthResult> {
    const environment = resolveRuntimeEnvironment();
    if (environment !== "staging" && environment !== "test") {
      throw new ApiError(404, "Not found.", { code: "ADMIN_BOOTSTRAP_UNAVAILABLE" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (
      sha256(normalizedEmail) !== APPROVED_FIRST_SUPER_ADMIN_EMAIL_SHA256 ||
      !bootstrapCodeMatches(bootstrapCode)
    ) {
      throw forbiddenAdminLogin();
    }

    const setupAlreadyClosed = await prisma.adminAuditEvent.findFirst({
      where: { action: "admin.bootstrap.super_admin", environment },
      select: { id: true },
    });
    if (setupAlreadyClosed) {
      throw new ApiError(409, "Initial Management Center setup is already complete.", {
        code: "ADMIN_BOOTSTRAP_CLOSED",
      });
    }

    let externalIdentity: { idToken: string; email?: string; localId?: string };
    let externalIdentityCreated = false;
    try {
      externalIdentity = await adminPasswordIdentityProvider.createUser(
        normalizedEmail,
        password,
      );
      externalIdentityCreated = true;
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "ADMIN_EMAIL_IN_USE"
      ) {
        try {
          externalIdentity = await adminPasswordIdentityProvider.signIn(
            normalizedEmail,
            password,
          );
        } catch {
          throw new ApiError(
            409,
            "Approved owner identity already exists with different credentials.",
            { code: "ADMIN_BOOTSTRAP_IDENTITY_CONFLICT" },
          );
        }
      } else {
        throw error;
      }
    }

    const identity = await firebaseAuthProvider.verifyIdToken(externalIdentity.idToken);
    if (identity.email?.trim().toLowerCase() !== normalizedEmail) {
      if (externalIdentityCreated) {
        await adminPasswordIdentityProvider.deleteUser(externalIdentity.idToken).catch(() => undefined);
      }
      throw forbiddenAdminLogin();
    }

    const passwordHash = await hashPassword(password);
    let user: User;
    try {
      user = await prisma.$transaction(async (tx) => {
        await ensureAdminFoundation(tx);

        const consumed = await tx.adminAuditEvent.findFirst({
          where: { action: "admin.bootstrap.super_admin", environment },
          select: { id: true },
        });
        if (consumed) {
          throw new ApiError(409, "Initial Management Center setup is already complete.", {
            code: "ADMIN_BOOTSTRAP_CLOSED",
          });
        }

        const superRole = await tx.adminRole.findUniqueOrThrow({
          where: { key: ADMIN_SYSTEM_ROLES.SUPER_ADMIN },
          select: { id: true },
        });
        const existingSuperAdmin = await tx.adminUserRole.findFirst({
          where: { roleId: superRole.id },
          select: { userId: true },
        });
        if (existingSuperAdmin) {
          throw new ApiError(409, "Initial Management Center setup is already complete.", {
            code: "ADMIN_BOOTSTRAP_CLOSED",
          });
        }

        const existing = await tx.user.findUnique({ where: { email: normalizedEmail } });
        const next = existing
          ? await tx.user.update({
              where: { id: existing.id },
              data: {
                passwordHash,
                role: UserRole.ADMIN,
                isActive: true,
                deletionRequestedAt: null,
              },
            })
          : await tx.user.create({
              data: {
                email: normalizedEmail,
                passwordHash,
                role: UserRole.ADMIN,
                isActive: true,
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
            beforeState: existing
              ? { role: existing.role, isActive: existing.isActive }
              : undefined,
            afterState: {
              role: UserRole.ADMIN,
              assignedRole: ADMIN_SYSTEM_ROLES.SUPER_ADMIN,
            },
            reason: "One-time approved staging owner bootstrap",
            environment,
            correlationId: requestContext.correlationId,
            requestId: requestContext.requestId,
            riskLevel: AdminAuditRiskLevel.CRITICAL,
          },
        });

        return next;
      });
    } catch (error) {
      if (externalIdentityCreated) {
        await adminPasswordIdentityProvider.deleteUser(externalIdentity.idToken).catch(() => undefined);
      }
      throw error;
    }

    await authRepository.updateLastLogin(user.id);
    return issueAuthSession(user, context);
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

    const user = await authRepository.findUserByEmail(email);
    if (!user || !(await hasAdminAccess(user))) throw invalidAdminLogin();

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
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
