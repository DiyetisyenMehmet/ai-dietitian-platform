import crypto from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { hashPassword } from "../../utils/password";
import { issueAuthSession, type AuthResult, type SessionContext } from "../auth/auth.service";
import {
  recordVerifiedAccountIdentity,
  normalizeAccountIdentifier,
} from "./account-identity.repository";
import type { VerifiedExternalIdentity } from "./firebase-auth.provider";
import { assertLinkableUser, ownershipRequired, requireSafeLinking } from "./safe-linking.policy";

export function requireGoogleSubject(identity: VerifiedExternalIdentity): string {
  if (identity.signInProvider !== "google.com" || !identity.googleSubject)
    throw ApiError.unauthorized("Google authentication is required.");
  return normalizeAccountIdentifier("GOOGLE", identity.googleSubject);
}

/** Candidate discovery is NEVER authorization or an instruction to merge. */
export async function legacyGoogleCandidates(identity: VerifiedExternalIdentity): Promise<User[]> {
  const uidDigest = crypto.createHash("sha256").update(identity.uid).digest("hex");
  const emails = [`social.${uidDigest}@social.diewish.invalid`];
  if (identity.email && identity.emailVerified) emails.push(identity.email.toLowerCase());
  // The old accountEmail implementation preferred a linked phone even for Google.
  // Preserve discovery of that record, but demand independent old-method proof.
  if (identity.phoneNumber)
    emails.push(`phone.${identity.phoneNumber.replace(/\D/g, "")}@phone.diewish.invalid`);
  return prisma.user.findMany({
    where: {
      OR: emails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })),
    },
  });
}

export async function safeGoogleLogin(
  identity: VerifiedExternalIdentity,
  context: SessionContext,
): Promise<AuthResult> {
  requireSafeLinking();
  const subject = requireGoogleSubject(identity);
  const bound = await prisma.accountIdentity.findUnique({
    where: { kind_identifier: { kind: "GOOGLE", identifier: subject } },
    include: { user: true },
  });
  if (bound) {
    let user = bound.user;
    // Preserve explicitly self-deactivated accounts, never admin/suspended/deleting ones.
    if (!user.isActive && user.deactivatedAt && user.role === "USER" && !user.deletionRequestedAt) {
      const changed = await prisma.user.updateMany({
        where: {
          id: user.id,
          isActive: false,
          deactivatedAt: { not: null },
          deletionRequestedAt: null,
          role: "USER",
        },
        data: { isActive: true, deactivatedAt: null },
      });
      if (changed.count !== 1) throw ownershipRequired();
      user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    }
    assertLinkableUser(user);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return issueAuthSession(user, context);
  }
  if ((await legacyGoogleCandidates(identity)).length) throw ownershipRequired();
  // No legacy account or reserved email may be silently adopted. New accounts
  // and their stable Google anchor are committed together or not at all.
  const email =
    identity.email && identity.emailVerified
      ? normalizeAccountIdentifier("EMAIL", identity.email)
      : `social.${crypto.createHash("sha256").update(identity.uid).digest("hex")}@social.diewish.invalid`;
  const secret = await hashPassword(crypto.randomBytes(32).toString("base64url"));
  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash: secret,
          hasUsablePassword: false,
          emailVerifiedAt: identity.emailVerified && identity.email === email ? new Date() : null,
          fullName: identity.displayName,
        },
      });
      await recordVerifiedAccountIdentity(tx, {
        userId: created.id,
        kind: "GOOGLE",
        identifier: subject,
        verifiedAt: new Date(),
      });
      return created;
    });
    return issueAuthSession(user, context);
  } catch {
    // Neither race winners nor SQL/provider errors identify another user.
    throw ownershipRequired();
  }
}
