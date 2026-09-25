import { UserRole, type User } from "@prisma/client";

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
import { verifyPassword } from "../../utils/password";
import { ADMIN_PERMISSIONS } from "./admin.permissions";
import { resolveAdminAccess } from "./admin-rbac.repository";

const DUMMY_PASSWORD_HASH = "$2a$12$" + "x".repeat(53);

function invalidAdminLogin(): ApiError {
  return new ApiError(401, "Management Center sign-in could not be verified.", {
    code: "ADMIN_AUTH_INVALID",
  });
}

async function assertAdminAccess(user: User): Promise<void> {
  if (!user.isActive || user.role !== UserRole.ADMIN) {
    throw invalidAdminLogin();
  }

  const access = await resolveAdminAccess(user.id);
  if (!access || !access.permissions.includes(ADMIN_PERMISSIONS.ACCESS)) {
    throw invalidAdminLogin();
  }
}

function phoneIdentityEmail(phoneNumber: string): string {
  return `phone.${phoneNumber.replace(/\D/g, "")}@phone.diewish.invalid`;
}

/**
 * Management Center authentication never creates a Diewish user. A principal
 * must already exist, be active, be ADMIN, and hold admin.access before any
 * refresh session is issued.
 */
export const adminAuthService = {
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

    await assertAdminAccess(user);
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
};
