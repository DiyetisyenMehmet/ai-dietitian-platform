import {
  AdminAuditRiskLevel,
  Prisma,
  UserRole,
  type User,
} from "@prisma/client";

import { authRepository } from "../auth/auth.repository";
import {
  issueAuthSession,
  type AuthResult,
  type SessionContext,
} from "../auth/auth.service";
import { firebaseAuthProvider } from "../identity/firebase-auth.provider";
import { issueIdentitySession } from "../identity/session.service";
import type { IdentitySessionResult } from "../identity/identity.types";
import { ApiError } from "../../utils/api-error";
import { hashPassword, verifyPassword } from "../../utils/password";
import {
  buildAuditSnapshot,
  runAuditedAdminMutation,
} from "./admin-audit.service";
import { resolveRuntimeEnvironment } from "./admin.environment";
import { ADMIN_PERMISSIONS, ADMIN_SYSTEM_ROLES } from "./admin.permissions";
import { resolveAdminAccess } from "./admin-rbac.repository";
import type { AdminIdentifierCheckInput } from "./admin-auth.schemas";

const DUMMY_PASSWORD_HASH = "$2a$12$" + "x".repeat(53);

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

function phoneIdentityEmail(phoneNumber: string): string {
  return `phone.${phoneNumber.replace(/\D/g, "")}@phone.diewish.invalid`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function requirePrimaryAdmin(userId: string): Promise<User> {
  const user = await authRepository.findUserById(userId);
  if (!user) throw forbiddenAdminLogin();
  await assertPrimaryEmailAccess(user);
  return user;
}

async function reauthenticate(user: User, currentPassword: string): Promise<void> {
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw invalidCurrentPassword();
  }
}

/**
 * Management Center authentication never creates a Diewish user. A principal
 * must already exist, be active, be ADMIN, and hold the required RBAC access.
 * Email sign-in is intentionally narrower: only the current SUPER_ADMIN
 * identity is accepted.
 */
export const adminAuthService = {
  async identifierAllowed(input: AdminIdentifierCheckInput): Promise<boolean> {
    const user =
      input.kind === "email"
        ? await authRepository.findUserByEmail(input.value)
        : await authRepository.findUserByEmail(phoneIdentityEmail(input.value));

    return input.kind === "email" ? hasPrimaryEmailAccess(user) : hasAdminAccess(user);
  },

  async loginWithEmail(
    email: string,
    password: string,
    context: SessionContext,
  ): Promise<AuthResult> {
    const user = await authRepository.findUserByEmail(email);
    if (!user) {
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      throw invalidAdminLogin();
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      throw invalidAdminLogin();
    }

    await assertPrimaryEmailAccess(user);
    await authRepository.updateLastLogin(user.id);
    return issueAuthSession(user, context);
  },

  async loginWithPhone(
    idToken: string,
    context: SessionContext,
  ): Promise<IdentitySessionResult> {
    const identity = await firebaseAuthProvider.verifyIdToken(idToken);
    if (!identity.phoneNumber) {
      throw invalidAdminLogin();
    }

    const user = await authRepository.findUserByEmail(
      phoneIdentityEmail(identity.phoneNumber),
    );
    if (!user) {
      throw invalidAdminLogin();
    }

    await assertAdminAccess(user);
    await authRepository.updateLastLogin(user.id);
    return issueIdentitySession(user, context, {
      phoneNumber: identity.phoneNumber,
      emailVerified: false,
    });
  },

  async changePrimaryEmail(
    userId: string,
    currentPassword: string,
    newEmail: string,
    sessionContext: SessionContext,
    requestContext: AdminMutationRequestContext,
  ): Promise<AuthResult> {
    const user = await requirePrimaryAdmin(userId);
    await reauthenticate(user, currentPassword);

    if (newEmail === user.email) {
      return issueAuthSession(user, sessionContext);
    }

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
            data: { email: newEmail },
          });

          return {
            result: next,
            before: buildAuditSnapshot({ email: user.email }, ["email"]),
            after: buildAuditSnapshot({ email: next.email }, ["email"]),
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

    await authRepository.revokeAllForUser(user.id);
    return issueAuthSession(updated, sessionContext);
  },

  async changePrimaryPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    sessionContext: SessionContext,
    requestContext: AdminMutationRequestContext,
  ): Promise<AuthResult> {
    const user = await requirePrimaryAdmin(userId);
    await reauthenticate(user, currentPassword);

    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new ApiError(400, "New password must be different from the current password.", {
        code: "ADMIN_PASSWORD_REUSE",
      });
    }

    const passwordHash = await hashPassword(newPassword);
    const updated = await runAuditedAdminMutation(
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

    await authRepository.revokeAllForUser(user.id);
    return issueAuthSession(updated, sessionContext);
  },
};
