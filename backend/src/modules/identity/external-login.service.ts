import crypto from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { phonePasswordEnabled, phonePasswordService } from "./phone-password.service";

import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { hashPassword } from "../../utils/password";
import { authRepository } from "../auth/auth.repository";
import { issueAuthSession, type AuthResult, type SessionContext } from "../auth/auth.service";
import { firebaseAuthProvider } from "./firebase-auth.provider";
import { safeGoogleLogin } from "./safe-google.service";
import { ownershipRequired } from "./safe-linking.policy";

function accountEmail(identity: {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
}): string {
  if (identity.phoneNumber) {
    return `phone.${identity.phoneNumber.replace(/\D/g, "")}@phone.diewish.invalid`;
  }
  if (identity.email && identity.emailVerified) return identity.email;
  const digest = crypto.createHash("sha256").update(identity.uid).digest("hex");
  return `social.${digest}@social.diewish.invalid`;
}

export const externalLoginService = {
  async login(idToken: string, context: SessionContext): Promise<AuthResult> {
    const identity = await firebaseAuthProvider.verifyIdToken(idToken);
    // accounts:lookup above has already verified this exact token with Firebase.
    // Check the authentication used for THIS token, not other methods linked to the account.
    // Otherwise an old Firebase password on a Google-linked account could bypass a local reset.
    const claims = jwt.decode(idToken) as
      | (JwtPayload & { firebase?: { sign_in_provider?: string } })
      | null;
    const provider = claims?.firebase?.sign_in_provider;
    if (
      claims?.sub !== identity.uid ||
      !["google.com", "apple.com", "phone"].includes(provider ?? "")
    ) {
      throw ApiError.forbidden("This sign-in provider is not enabled for Diewish.");
    }
    if (phonePasswordEnabled() && identity.signInProvider === "phone") {
      return phonePasswordService.legacySmsLogin(identity, context);
    }
    if (env.ACCOUNT_SAFE_LINKING_ENABLED) {
      if (identity.signInProvider === "google.com") return safeGoogleLogin(identity, context);
      if (!["phone", "apple.com"].includes(identity.signInProvider ?? "")) {
        throw ApiError.forbidden("This sign-in provider is not enabled for Diewish.");
      }
      if (identity.signInProvider === "phone" && identity.phoneAuthenticationVerified !== true)
        throw ownershipRequired();
      if (identity.signInProvider === "phone" && identity.phoneNumber) {
        const binding = await prisma.accountIdentity.findUnique({
          where: { kind_identifier: { kind: "PHONE", identifier: identity.phoneNumber } },
          include: { user: true },
        });
        // Linking a recovery phone must not accidentally enable SMS-only normal
        // login or create a second account. #51 owns phone+password sign-in.
        if (binding && binding.user.email !== accountEmail(identity)) throw ownershipRequired();
      }
    }

    const social = provider === "google.com" || provider === "apple.com";
    if (!identity.phoneNumber && !social) {
      throw ApiError.forbidden("This sign-in provider is not enabled for Diewish.");
    }

    // A2 routes Google by stable subject above. No remaining external provider
    // may enter or create a phone account merely through a linked profile phone.
    if (phonePasswordEnabled() && identity.phoneNumber) throw ownershipRequired();

    const email = accountEmail(identity);
    let user = await authRepository.findUserByEmail(email);
    if (!user) {
      const generatedSecret = crypto.randomBytes(32).toString("base64url");
      user = await authRepository.createUser({
        email,
        passwordHash: await hashPassword(generatedSecret),
        hasUsablePassword: false,
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
      if (!user.deactivatedAt) {
        throw ApiError.forbidden("This account is not available.");
      }
      const changed = await prisma.user.updateMany({
        where: { id: user.id, isActive: false, deactivatedAt: { not: null } },
        data: { isActive: true, deactivatedAt: null },
      });
      if (changed.count !== 1) throw ApiError.forbidden("This account is not available.");
      user = (await authRepository.findUserById(user.id))!;
    }

    await authRepository.updateLastLogin(user.id);
    return issueAuthSession(user, context);
  },
};
