import crypto from "node:crypto";
import type { Prisma, PhonePasswordChallenge } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { generateOpaqueToken, hashToken } from "../../utils/jwt";
import { hashPassword, verifyPassword } from "../../utils/password";
import { accountRepository } from "../account/account.repository";
import { firebaseAuthProvider } from "./firebase-auth.provider";
import { phonePasswordEnabled } from "./phone-password.service";
import {
  LINK_TTL_MS,
  proofEventHash,
  requireFreshExternal,
  securityStamp,
} from "./safe-linking.policy";
import {
  smsRecoveryBeginSchema,
  smsRecoveryCompleteSchema,
  smsRecoveryVerifySchema,
} from "./sms-recovery.schemas";
const PURPOSE = "SMS_PASSWORD_RESET";
export const smsRecoveryEnabled = () => env.PHONE_SMS_RECOVERY_ENABLED && phonePasswordEnabled();
export function requireSmsRecovery() {
  if (!smsRecoveryEnabled())
    throw new ApiError(503, "SMS recovery is not enabled.", { code: "SMS_RECOVERY_DISABLED" });
}
const invalid = () =>
  new ApiError(400, "This recovery verification is invalid or expired.", {
    code: "SMS_RECOVERY_INVALID",
  });
const isSecret = (value?: string): value is string => !!value && /^[A-Za-z0-9_-]{43}$/.test(value);
async function safe<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Includes provider/SQL exceptions; never log or expose their payloads.
    throw invalid();
  }
}
async function getOperation(secret?: string) {
  if (!isSecret(secret)) throw invalid();
  const op = await prisma.phonePasswordChallenge.findUnique({
    where: { secretHash: hashToken(secret), purpose: PURPOSE },
  });
  assertPending(op);
  return op;
}
function assertPending(op: PhonePasswordChallenge | null): asserts op is PhonePasswordChallenge {
  if (
    !op ||
    op.purpose !== PURPOSE ||
    op.consumedAt ||
    op.failedAttempts >= 5 ||
    op.expiresAt.getTime() <= Date.now()
  )
    throw invalid();
}
async function failed(id: string): Promise<never> {
  await prisma.phonePasswordChallenge.updateMany({
    where: { id, purpose: PURPOSE, consumedAt: null, failedAttempts: { lt: 5 } },
    data: { failedAttempts: { increment: 1 } },
  });
  throw invalid();
}
async function ownerFor(tx: Prisma.TransactionClient, number: string) {
  const binding = await tx.accountIdentity.findUnique({
    where: { kind_identifier: { kind: "PHONE", identifier: number } },
    include: { user: { include: { accountIdentities: true } } },
  });
  const owner = binding?.user;
  // Manager decision: mixed email/Google accounts qualify ONLY with a prior
  // verified phone and an already usable Diewish password. No first password,
  // account reactivation, inferred phone or Google recovery bypass is added.
  if (
    !owner ||
    !owner.isActive ||
    owner.role !== "USER" ||
    owner.deletionRequestedAt ||
    owner.deactivatedAt ||
    owner.hasUsablePassword !== true ||
    owner.email.endsWith("@guest.diewish.invalid")
  )
    throw invalid();
  const legacy = await tx.user.findMany({
    where: {
      email: { equals: `phone.${number.slice(1)}@phone.diewish.invalid`, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (legacy.some((u) => u.id !== owner.id)) throw invalid();
  return owner;
}
async function lockOwnerAndPhone(tx: Prisma.TransactionClient, userId: string, number: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`diewish-identity:PHONE:${number}`}, 0))::text`;
}
async function beginBudget(number: string) {
  const key = crypto
    .createHmac("sha256", env.JWT_REFRESH_SECRET)
    .update(`sms-recovery:${number}`)
    .digest("hex");
  const allowed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`diewish-phone-budget:${key}`}, 0))::text`;
    const current = await tx.phonePasswordBudget.findUnique({ where: { key } });
    const now = new Date();
    if (!current || now.getTime() - current.windowStartedAt.getTime() >= 10 * 60_000) {
      await tx.phonePasswordBudget.upsert({
        where: { key },
        create: { key, windowStartedAt: now, attempts: 1 },
        update: { windowStartedAt: now, attempts: 1 },
      });
      return true;
    }
    if (current.attempts >= 5) return false;
    await tx.phonePasswordBudget.update({ where: { key }, data: { attempts: { increment: 1 } } });
    return true;
  });
  if (!allowed) throw ApiError.tooManyRequests("Too many verification requests. Try again later.");
}
export const smsRecoveryService = {
  async status(secret?: string) {
    if (!smsRecoveryEnabled()) return { enabled: false, pending: false, verified: false };
    try {
      const op = await getOperation(secret);
      return {
        enabled: true,
        pending: true,
        verified: !!op.verifiedAt,
        expiresAt: op.expiresAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof ApiError) return { enabled: true, pending: false, verified: false };
      throw error;
    }
  },
  async begin(raw: { phoneNumber: string }, oldSecret?: string) {
    requireSmsRecovery();
    const input = smsRecoveryBeginSchema.parse(raw);
    return safe(async () => {
      await beginBudget(input.phoneNumber);
      const secret = generateOpaqueToken(),
        expiresAt = new Date(Date.now() + LINK_TTL_MS);
      await prisma.$transaction(async (tx) => {
        if (isSecret(oldSecret))
          await tx.phonePasswordChallenge.updateMany({
            where: { secretHash: hashToken(oldSecret), purpose: PURPOSE, consumedAt: null },
            data: { consumedAt: new Date() },
          });
        await tx.phonePasswordChallenge.create({
          data: {
            purpose: PURPOSE,
            phoneNumber: input.phoneNumber,
            secretHash: hashToken(secret),
            proofEventHash: null,
            expiresAt,
          },
        });
      });
      // Identical response for known/unknown/suspended/passwordless accounts.
      return { secret, expiresAt: expiresAt.toISOString() };
    });
  },
  async verify(secret: string | undefined, raw: { idToken: string }) {
    requireSmsRecovery();
    const input = smsRecoveryVerifySchema.parse(raw);
    return safe(async () => {
      const op = await getOperation(secret);
      if (op.verifiedAt) throw invalid();
      try {
        const identity = await firebaseAuthProvider.verifyIdToken(input.idToken);
        requireFreshExternal(identity);
        if (
          identity.signInProvider !== "phone" ||
          !identity.phoneAuthenticationVerified ||
          identity.phoneNumber !== op.phoneNumber ||
          identity.authTime! < Math.floor(op.createdAt.getTime() / 1000)
        )
          throw invalid();
        const candidate = await prisma.$transaction((tx) => ownerFor(tx, op.phoneNumber));
        await prisma.$transaction(async (tx) => {
          await lockOwnerAndPhone(tx, candidate.id, op.phoneNumber);
          const current = await tx.phonePasswordChallenge.findUnique({ where: { id: op.id } });
          assertPending(current);
          if (current.verifiedAt) throw invalid();
          const owner = await ownerFor(tx, op.phoneNumber);
          if (
            owner.id !== candidate.id ||
            !owner.accountIdentities.some(
              (i) =>
                i.kind === "PHONE" &&
                i.identifier === op.phoneNumber &&
                i.verifiedAt.getTime() <= op.createdAt.getTime(),
            )
          )
            throw invalid();
          requireFreshExternal(identity);
          const expiresAt = new Date(
            Math.min(current.expiresAt.getTime(), identity.authTime! * 1000 + LINK_TTL_MS),
          );
          const claimed = await tx.phonePasswordChallenge.updateMany({
            where: {
              id: op.id,
              purpose: PURPOSE,
              verifiedAt: null,
              consumedAt: null,
              failedAttempts: { lt: 5 },
              expiresAt: { gt: new Date() },
            },
            data: {
              expectedUserId: owner.id,
              verifiedAt: new Date(),
              securityStamp: securityStamp(owner, owner.accountIdentities),
              proofEventHash: proofEventHash(identity, "PHONE", op.phoneNumber),
              expiresAt,
            },
          });
          if (claimed.count !== 1) throw invalid();
        });
      } catch {
        return failed(op.id);
      }
      return { verified: true };
    });
  },
  async cancel(secret?: string) {
    requireSmsRecovery();
    return safe(async () => {
      if (isSecret(secret))
        await prisma.phonePasswordChallenge.updateMany({
          where: { purpose: PURPOSE, secretHash: hashToken(secret), consumedAt: null },
          data: { consumedAt: new Date() },
        });
    });
  },
  async complete(
    secret: string | undefined,
    raw: { newPassword: string; passwordConfirmation: string },
  ) {
    requireSmsRecovery();
    const input = smsRecoveryCompleteSchema.parse(raw);
    return safe(async () => {
      const op = await getOperation(secret);
      if (!op.verifiedAt || !op.expectedUserId || !op.securityStamp) throw invalid();
      const before = await prisma.$transaction((tx) => ownerFor(tx, op.phoneNumber));
      if (
        before.id !== op.expectedUserId ||
        securityStamp(before, before.accountIdentities) !== op.securityStamp
      )
        throw invalid();
      if (await verifyPassword(input.newPassword, before.passwordHash)) return failed(op.id);
      const passwordHash = await hashPassword(input.newPassword);
      await prisma.$transaction(async (tx) => {
        await lockOwnerAndPhone(tx, before.id, op.phoneNumber);
        const current = await tx.phonePasswordChallenge.findUnique({ where: { id: op.id } });
        assertPending(current);
        const owner = await ownerFor(tx, op.phoneNumber);
        if (
          !current.verifiedAt ||
          current.expectedUserId !== owner.id ||
          securityStamp(owner, owner.accountIdentities) !== current.securityStamp
        )
          throw invalid();
        const consumed = await tx.phonePasswordChallenge.updateMany({
          where: {
            id: op.id,
            purpose: PURPOSE,
            consumedAt: null,
            failedAttempts: { lt: 5 },
            expiresAt: { gt: new Date() },
          },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1) throw invalid();
        // Reuse PR58's exact credential-state guard, version bump and refresh
        // revocation. The transaction parameter only composes the accepted write.
        const changed = await accountRepository.changePassword(
          owner.id,
          passwordHash,
          { passwordHash: owner.passwordHash, authVersion: owner.authVersion },
          tx,
        );
        if (!changed) throw invalid();
        const now = new Date();
        await tx.accountToken.updateMany({
          where: { userId: owner.id, type: "PASSWORD_RESET", usedAt: null },
          data: { usedAt: now },
        });
        await tx.passwordResetDelivery.updateMany({
          where: { userId: owner.id },
          data: { completedAt: now },
        });
        await tx.accountIdentityOperation.updateMany({
          where: { userId: owner.id, consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.phonePasswordChallenge.updateMany({
          where: { expectedUserId: owner.id, consumedAt: null },
          data: { consumedAt: now },
        });
      });
      return { reset: true }; // NO auth session, access token or health payload.
    });
  },
};
