import crypto from "node:crypto";
import type { AccountIdentityKind, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { generateOpaqueToken, hashToken } from "../../utils/jwt";
import { verifyPassword } from "../../utils/password";
import { issueAuthSession, type SessionContext } from "../auth/auth.service";
import { accountLinkDelivery } from "./account-link-delivery";
import {
  normalizeAccountIdentifier,
  recordVerifiedAccountIdentity,
} from "./account-identity.repository";
import { firebaseAuthProvider, type VerifiedExternalIdentity } from "./firebase-auth.provider";
import { legacyGoogleCandidates, requireGoogleSubject } from "./safe-google.service";
import {
  assertLinkableUser,
  invalidLink,
  LINK_TTL_MS,
  MAX_LINK_ATTEMPTS,
  ownershipRequired,
  proofEventHash,
  requireFreshExternal,
  requireSafeLinking,
  securityStamp,
} from "./safe-linking.policy";

export type AccountReauthentication =
  | { password: string; idToken?: never }
  | { idToken: string; password?: never };
const conflict = () =>
  new ApiError(409, "This identity cannot be linked automatically.", {
    code: "ACCOUNT_IDENTITY_CONFLICT",
  });

async function lockUser(
  tx: Prisma.TransactionClient,
  userId: string,
  allowSelfDeactivated = false,
) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({
    where: { id: userId },
    include: { accountIdentities: true },
  });
  if (
    !(
      allowSelfDeactivated &&
      user?.role === "USER" &&
      !user.isActive &&
      user.deactivatedAt &&
      !user.deletionRequestedAt &&
      !user.email.endsWith("@guest.diewish.invalid")
    )
  )
    assertLinkableUser(user);
  return user!;
}
async function enforceBudget(tx: Prisma.TransactionClient, userId: string) {
  const count = await tx.accountIdentityOperation.count({
    where: { userId, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } },
  });
  if (count >= 5)
    throw ApiError.tooManyRequests("Too many account verification attempts. Try again later.");
}
async function authorizeReauthentication(
  userId: string,
  input: AccountReauthentication,
): Promise<{ stamp: string; authenticatedAt: Date }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accountIdentities: true },
  });
  assertLinkableUser(user);
  let authenticatedAt = new Date();
  if ("password" in input && input.password) {
    if (
      user.hasUsablePassword === false ||
      Buffer.byteLength(input.password, "utf8") > 72 ||
      !(await verifyPassword(input.password, user.passwordHash))
    )
      throw invalidLink();
  } else if (input.idToken) {
    const identity = await firebaseAuthProvider.verifyIdToken(input.idToken);
    requireFreshExternal(identity);
    authenticatedAt = new Date(identity.authTime! * 1000);
    const kind =
      identity.signInProvider === "google.com"
        ? "GOOGLE"
        : identity.signInProvider === "phone"
          ? "PHONE"
          : null;
    const identifier = kind === "GOOGLE" ? requireGoogleSubject(identity) : identity.phoneNumber;
    if (!kind || !identifier) throw invalidLink();
    const bound = user.accountIdentities.some(
      (x) => x.kind === kind && x.identifier === identifier,
    );
    // Existing SMS-only users can prove their original legacy phone, without
    // first possessing a password or assuming a Google email match is proof.
    if (kind === "PHONE" && identity.phoneAuthenticationVerified !== true) throw invalidLink();
    const legacyPhone =
      kind === "PHONE" &&
      user.email === `phone.${identifier.replace(/\D/g, "")}@phone.diewish.invalid`;
    if (!bound && !legacyPhone) throw invalidLink();
  } else throw invalidLink();
  return { stamp: securityStamp(user, user.accountIdentities), authenticatedAt };
}
async function rejectAttempt(operationId: string, sessionHash: string): Promise<never> {
  await prisma.accountIdentityOperation.updateMany({
    where: {
      id: operationId,
      sessionHash,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      failedAttempts: { lt: MAX_LINK_ATTEMPTS },
    },
    data: { failedAttempts: { increment: 1 } },
  });
  throw invalidLink();
}
async function validateExternalProof(
  kind: AccountIdentityKind,
  identifier: string,
  idToken?: string,
): Promise<VerifiedExternalIdentity> {
  if (!idToken) throw invalidLink();
  const identity = await firebaseAuthProvider.verifyIdToken(idToken);
  requireFreshExternal(identity);
  if (kind === "GOOGLE") {
    if (requireGoogleSubject(identity) !== identifier) throw invalidLink();
  } else if (kind === "PHONE") {
    if (
      identity.signInProvider !== "phone" ||
      identity.phoneNumber !== identifier ||
      identity.phoneAuthenticationVerified !== true
    )
      throw invalidLink();
  } else throw invalidLink();
  return identity;
}

export const accountLinkService = {
  async start(
    userId: string,
    sessionToken: string,
    input: {
      kind: AccountIdentityKind;
      identifier: string;
      reauthentication: AccountReauthentication;
    },
  ) {
    requireSafeLinking();
    const identifier = normalizeAccountIdentifier(input.kind, input.identifier);
    if (input.kind === "EMAIL") accountLinkDelivery.assertConfigured();
    // Persist a spent attempt BEFORE expensive credential verification so a
    // distributed wrong-password attack shares the same per-user budget.
    const attempt = await prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, userId);
      await enforceBudget(tx, userId);
      return tx.accountIdentityOperation.create({
        data: {
          userId,
          purpose: "LINK_METHOD",
          kind: input.kind,
          identifier,
          sessionHash: hashToken(sessionToken),
          securityStamp: securityStamp(user, user.accountIdentities),
          consumedAt: new Date(),
          reauthenticatedAt: new Date(),
          expiresAt: new Date(Date.now() + LINK_TTL_MS),
        },
      });
    });
    const { stamp, authenticatedAt } = await authorizeReauthentication(
      userId,
      input.reauthentication,
    );
    const raw = input.kind === "EMAIL" ? generateOpaqueToken() : null;
    const operation = await prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, userId);
      if (securityStamp(user, user.accountIdentities) !== stamp || attempt.securityStamp !== stamp)
        throw invalidLink();
      const existing = user.accountIdentities.find((x) => x.kind === input.kind);
      if (existing) throw conflict(); // no implicit replacement/unlink
      const owner = await tx.accountIdentity.findUnique({
        where: { kind_identifier: { kind: input.kind, identifier } },
      });
      if (owner && owner.userId !== userId) throw conflict();
      if (input.kind !== "GOOGLE") {
        const email =
          input.kind === "EMAIL"
            ? identifier
            : `phone.${identifier.slice(1)}@phone.diewish.invalid`;
        if (
          await tx.user.findFirst({
            where: { id: { not: userId }, email: { equals: email, mode: "insensitive" } },
          })
        )
          throw conflict();
      }
      return tx.accountIdentityOperation.update({
        where: { id: attempt.id },
        data: {
          proofHash: raw ? hashToken(raw) : null,
          consumedAt: null,
          reauthenticatedAt: authenticatedAt,
          expiresAt: new Date(authenticatedAt.getTime() + LINK_TTL_MS),
        },
      });
    });
    if (raw) {
      try {
        await accountLinkDelivery.send(identifier, operation.id, raw);
      } catch {
        await prisma.accountIdentityOperation.updateMany({
          where: { id: operation.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        throw new ApiError(503, "Secure email verification is unavailable.", {
          code: "ACCOUNT_LINK_DELIVERY_UNAVAILABLE",
        });
      }
    }
    return { operationId: operation.id, expiresAt: operation.expiresAt.toISOString() };
  },

  async complete(
    userId: string,
    sessionToken: string,
    input: { operationId: string; token?: string; idToken?: string },
  ) {
    requireSafeLinking();
    const sessionHash = hashToken(sessionToken);
    const operation = await prisma.accountIdentityOperation.findUnique({
      where: { id: input.operationId },
    });
    if (
      !operation ||
      operation.userId !== userId ||
      operation.purpose !== "LINK_METHOD" ||
      operation.sessionHash !== sessionHash
    )
      throw invalidLink();
    let eventHash: string | null = null;
    if (operation.kind === "EMAIL") {
      if (
        !input.token ||
        !operation.proofHash ||
        !crypto.timingSafeEqual(
          Buffer.from(hashToken(input.token)),
          Buffer.from(operation.proofHash),
        )
      )
        return rejectAttempt(operation.id, sessionHash);
    } else {
      try {
        const external = await validateExternalProof(
          operation.kind,
          operation.identifier,
          input.idToken,
        );
        eventHash = proofEventHash(external, operation.kind, operation.identifier);
      } catch {
        return rejectAttempt(operation.id, sessionHash);
      }
    }
    try {
      await prisma.$transaction(async (tx) => {
        const user = await lockUser(tx, userId);
        const current = await tx.accountIdentityOperation.findUnique({
          where: { id: operation.id },
        });
        if (
          !current ||
          current.consumedAt ||
          current.failedAttempts >= MAX_LINK_ATTEMPTS ||
          current.expiresAt.getTime() <= Date.now() ||
          Date.now() - current.reauthenticatedAt.getTime() >= LINK_TTL_MS ||
          securityStamp(user, user.accountIdentities) !== current.securityStamp
        )
          throw invalidLink();
        const claimed = await tx.accountIdentityOperation.updateMany({
          where: {
            id: current.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
            failedAttempts: { lt: MAX_LINK_ATTEMPTS },
          },
          data: { consumedAt: new Date(), proofEventHash: eventHash },
        });
        if (claimed.count !== 1) throw invalidLink();
        await recordVerifiedAccountIdentity(tx, {
          userId,
          kind: current.kind,
          identifier: current.identifier,
          verifiedAt: new Date(),
        });
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // Includes replay of a Firebase auth event; no raw SQL/token/identity leaks.
      throw invalidLink();
    }
    return { linked: true };
  },

  async startGoogleTransition(idToken: string) {
    requireSafeLinking();
    accountLinkDelivery.assertConfigured();
    const identity = await firebaseAuthProvider.verifyIdToken(idToken);
    requireFreshExternal(identity);
    const subject = requireGoogleSubject(identity);
    if (
      await prisma.accountIdentity.findUnique({
        where: { kind_identifier: { kind: "GOOGLE", identifier: subject } },
      })
    )
      throw ownershipRequired();
    const candidates = await legacyGoogleCandidates(identity);
    if (candidates.length !== 1) throw ownershipRequired();
    const candidate = candidates[0]!;
    if (
      !(
        candidate.role === "USER" &&
        !candidate.isActive &&
        candidate.deactivatedAt &&
        !candidate.deletionRequestedAt &&
        !candidate.email.endsWith("@guest.diewish.invalid")
      )
    )
      assertLinkableUser(candidate);
    // Send ONLY to the account's existing real mailbox; a supplied new address
    // or token's phone is not recovery proof. Inaccessible mail has no bypass.
    if (candidate.email.endsWith(".diewish.invalid")) throw ownershipRequired();
    const raw = generateOpaqueToken();
    const operation = await prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, candidate.id, true);
      if (user.email !== candidate.email) throw ownershipRequired();
      const previouslyVerifiedMailbox =
        user.emailVerifiedAt !== null ||
        user.accountIdentities.some(
          (x) => x.kind === "EMAIL" && x.identifier === user.email.toLowerCase(),
        );
      if (!previouslyVerifiedMailbox) throw ownershipRequired();
      await enforceBudget(tx, user.id);
      if (user.accountIdentities.some((x) => x.kind === "GOOGLE")) throw ownershipRequired();
      return tx.accountIdentityOperation.create({
        data: {
          userId: user.id,
          purpose: "GOOGLE_TRANSITION",
          kind: "GOOGLE",
          identifier: subject,
          sessionHash: hashToken(idToken),
          securityStamp: securityStamp(user, user.accountIdentities),
          proofHash: hashToken(raw),
          reauthenticatedAt: new Date(identity.authTime! * 1000),
          expiresAt: new Date(identity.authTime! * 1000 + LINK_TTL_MS),
        },
      });
    });
    try {
      await accountLinkDelivery.send(candidate.email, operation.id, raw);
    } catch {
      await prisma.accountIdentityOperation.updateMany({
        where: { id: operation.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      throw new ApiError(503, "Secure email verification is unavailable.", {
        code: "ACCOUNT_LINK_DELIVERY_UNAVAILABLE",
      });
    }
    return { operationId: operation.id, expiresAt: operation.expiresAt.toISOString() };
  },

  async completeGoogleTransition(
    input: { operationId: string; token: string; idToken: string },
    context: SessionContext,
  ) {
    requireSafeLinking();
    const sessionHash = hashToken(input.idToken);
    const op = await prisma.accountIdentityOperation.findUnique({
      where: { id: input.operationId },
    });
    if (!op || op.purpose !== "GOOGLE_TRANSITION" || op.sessionHash !== sessionHash)
      throw invalidLink();
    if (
      !op.proofHash ||
      !crypto.timingSafeEqual(Buffer.from(hashToken(input.token)), Buffer.from(op.proofHash))
    )
      return rejectAttempt(op.id, sessionHash);
    let identity: VerifiedExternalIdentity;
    try {
      identity = await validateExternalProof("GOOGLE", op.identifier, input.idToken);
    } catch {
      return rejectAttempt(op.id, sessionHash);
    }
    try {
      const user = await prisma.$transaction(async (tx) => {
        let user = await lockUser(tx, op.userId, true);
        const current = await tx.accountIdentityOperation.findUnique({ where: { id: op.id } });
        if (
          !current ||
          current.consumedAt ||
          current.failedAttempts >= MAX_LINK_ATTEMPTS ||
          current.expiresAt.getTime() <= Date.now() ||
          securityStamp(user, user.accountIdentities) !== current.securityStamp
        )
          throw invalidLink();
        const claimed = await tx.accountIdentityOperation.updateMany({
          where: {
            id: op.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
            failedAttempts: { lt: MAX_LINK_ATTEMPTS },
          },
          data: {
            consumedAt: new Date(),
            proofEventHash: proofEventHash(identity, "GOOGLE", op.identifier),
          },
        });
        if (claimed.count !== 1) throw invalidLink();
        if (!user.isActive) {
          const restored = await tx.user.update({
            where: { id: user.id },
            data: { isActive: true, deactivatedAt: null },
          });
          user = { ...restored, accountIdentities: user.accountIdentities };
        }
        await recordVerifiedAccountIdentity(tx, {
          userId: user.id,
          kind: "GOOGLE",
          identifier: op.identifier,
          verifiedAt: new Date(),
        });
        // Both the old mailbox and new Google identity were independently proved.
        if (!user.accountIdentities.some((x) => x.kind === "EMAIL")) {
          await recordVerifiedAccountIdentity(tx, {
            userId: user.id,
            kind: "EMAIL",
            identifier: user.email,
            verifiedAt: new Date(),
          });
        }
        return tx.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date(), lastLoginAt: new Date() },
        });
      });
      return issueAuthSession(user, context);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw invalidLink();
    }
  },
};
