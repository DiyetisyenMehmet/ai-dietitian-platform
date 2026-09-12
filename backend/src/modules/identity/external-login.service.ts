import crypto from "node:crypto";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { hashPassword } from "../../utils/password";
import { authRepository } from "../auth/auth.repository";
import { issueAuthSession, type AuthResult, type SessionContext } from "../auth/auth.service";
import { firebaseAuthProvider } from "./firebase-auth.provider";

function accountEmail(identity: { uid: string; email: string | null; emailVerified: boolean; phoneNumber: string | null }): string {
  if (identity.phoneNumber) {
    return `phone.${identity.phoneNumber.replace(/\D/g, "")}@phone.diewish.invalid`;
  }
  if (identity.email && identity.emailVerified) return identity.email;
  const digest = crypto.createHash("sha256").update(identity.uid).digest("hex");
  return `social.${digest}@social.diewish.invalid`;
}

async function deactivatedAt(userId: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ deactivatedAt: Date | null }>>`
    SELECT "deactivatedAt" FROM "users" WHERE "id" = ${userId} LIMIT 1
  `;
  return rows[0]?.deactivatedAt ?? null;
}

export const externalLoginService = {
  async login(idToken: string, context: SessionContext): Promise<AuthResult> {
    const identity = await firebaseAuthProvider.verifyIdToken(idToken);
    const social = identity.providers.some(
      (provider) => provider === "google.com" || provider === "apple.com",
    );
    if (!identity.phoneNumber && !social) {
      throw ApiError.forbidden("This sign-in provider is not enabled for Diewish.");
    }

    const email = accountEmail(identity);
    let user = await authRepository.findUserByEmail(email);
    if (!user) {
      const generatedSecret = crypto.randomBytes(32).toString("base64url");
      user = await authRepository.createUser({
        email,
        passwordHash: await hashPassword(generatedSecret),
        fullName: identity.displayName ?? undefined,
      });
      if (identity.emailVerified && identity.email === email) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: new Date() },
        });
      }
    }

    if (!user.isActive) {
      if (!(await deactivatedAt(user.id))) {
        throw ApiError.forbidden("This account is not available.");
      }
      await prisma.$executeRaw`
        UPDATE "users" SET "isActive" = true, "deactivatedAt" = NULL WHERE "id" = ${user.id}
      `;
      user = (await authRepository.findUserById(user.id))!;
    }

    await authRepository.updateLastLogin(user.id);
    return issueAuthSession(user, context);
  },
};
