import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { generateOpaqueToken, hashToken } from "../../utils/jwt";
import { hashPassword } from "../../utils/password";
import { authService, issueAuthSession, type SessionContext } from "../auth/auth.service";
import {
  normalizeAccountIdentifier,
  recordVerifiedAccountIdentity,
} from "./account-identity.repository";
import { firebaseAuthProvider, type VerifiedExternalIdentity } from "./firebase-auth.provider";
import {
  assertLinkableUser,
  LINK_TTL_MS,
  proofEventHash,
  requireFreshExternal,
  securityStamp,
} from "./safe-linking.policy";
import {
  phonePasswordCompleteSchema,
  phonePasswordLoginSchema,
  phonePasswordStartSchema,
} from "./phone-password.schemas";

export const phonePasswordEnabled = () =>
  env.PHONE_PASSWORD_AUTH_ENABLED && env.ACCOUNT_SAFE_LINKING_ENABLED;
export function requirePhonePassword() {
  if (!phonePasswordEnabled())
    throw new ApiError(503, "Phone password registration is not enabled.", {
      code: "PHONE_PASSWORD_DISABLED",
    });
}
const invalid = () =>
  new ApiError(400, "Verification is invalid or expired. Request a new SMS.", {
    code: "PHONE_SETUP_INVALID",
  });
const ownership = () =>
  new ApiError(409, "Use your existing Diewish account to continue.", {
    code: "ACCOUNT_OWNERSHIP_REQUIRED",
  });
const passwordRequired = () =>
  new ApiError(409, "Sign in with your phone number and Diewish password.", {
    code: "PHONE_PASSWORD_REQUIRED",
  });
const placeholder = (number: string) => `phone.${number.slice(1)}@phone.diewish.invalid`;
type Owner = Prisma.UserGetPayload<{ include: { accountIdentities: true } }>;

// Resolve BOTH registry and old placeholder; disagreement is never a merge.
async function resolveOwner(
  tx: Prisma.TransactionClient,
  phoneNumber: string,
): Promise<Owner | null> {
  const [binding, legacy] = await Promise.all([
    tx.accountIdentity.findUnique({
      where: { kind_identifier: { kind: "PHONE", identifier: phoneNumber } },
      include: { user: { include: { accountIdentities: true } } },
    }),
    tx.user.findMany({
      where: { email: { equals: placeholder(phoneNumber), mode: "insensitive" } },
      include: { accountIdentities: true },
    }),
  ]);
  const ids = new Set([...(binding ? [binding.userId] : []), ...legacy.map((u) => u.id)]);
  if (ids.size > 1 || legacy.length > 1) throw ownership();
  return binding?.user ?? legacy[0] ?? null;
}
async function lockPhone(tx: Prisma.TransactionClient, number: string) {
  // Same identifier reservation used by A2 and its legacy User.email trigger.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`diewish-identity:PHONE:${number}`}, 0))::text`;
}
async function lockOwner(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
}
function assertFirstPasswordOwner(user: Owner, number: string, authenticatedUserId?: string) {
  assertLinkableUser(user);
  if (user.email.toLowerCase() !== placeholder(number)) throw ownership(); // no Google/email recovery via this flow
  if (user.accountIdentities.some((x) => x.kind === "PHONE" && x.identifier !== number))
    throw ownership();
  if (user.hasUsablePassword === true) throw passwordRequired();
  // Unknown legacy provenance is NOT inferred from the placeholder. Require an
  // existing authenticated principal AND independent fresh SMS for that account.
  if (user.hasUsablePassword === null && authenticatedUserId !== user.id)
    throw new ApiError(409, "Verify access to your existing SMS account first.", {
      code: "PHONE_LEGACY_SESSION_REQUIRED",
    });
}
function requireSms(identity: VerifiedExternalIdentity, expected?: string): string {
  try {
    requireFreshExternal(identity);
  } catch {
    throw invalid();
  }
  if (
    identity.signInProvider !== "phone" ||
    identity.phoneAuthenticationVerified !== true ||
    !identity.phoneNumber ||
    (expected && identity.phoneNumber !== expected)
  )
    throw invalid();
  return normalizeAccountIdentifier("PHONE", identity.phoneNumber);
}
async function budget(purpose: "setup" | "login", number: string, max: number) {
  const key = crypto
    .createHmac("sha256", env.JWT_REFRESH_SECRET)
    .update(`${purpose}:${number}`)
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
    if (current.attempts >= max) return false;
    await tx.phonePasswordBudget.update({ where: { key }, data: { attempts: { increment: 1 } } });
    return true;
  });
  if (!allowed) throw ApiError.tooManyRequests("Too many attempts. Try again later.");
}
// Keep Prisma/provider exceptions (which may embed identifiers) out of logging.
async function sanitized<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalid();
  }
}
function validSecret(secret: string | undefined): secret is string {
  return !!secret && /^[A-Za-z0-9_-]{43}$/.test(secret);
}

export const phonePasswordService = {
  async start(
    raw: { phoneNumber: string; idToken: string },
    oldSecret?: string,
    authenticatedUserId?: string,
  ) {
    requirePhonePassword();
    const input = phonePasswordStartSchema.parse(raw);
    return sanitized(async () => {
      await budget("setup", input.phoneNumber, 5);
      const identity = await firebaseAuthProvider.verifyIdToken(input.idToken);
      const number = requireSms(identity, input.phoneNumber);
      const secret = generateOpaqueToken();
      const expiresAt = new Date(Math.min(identity.authTime! * 1000, Date.now()) + LINK_TTL_MS);
      await prisma.$transaction(async (tx) => {
        let owner = await resolveOwner(tx, number);
        if (owner) await lockOwner(tx, owner.id);
        await lockPhone(tx, number);
        const current = await resolveOwner(tx, number);
        if (current?.id !== owner?.id) throw ownership();
        owner = current;
        if (owner) assertFirstPasswordOwner(owner, number, authenticatedUserId);
        requireSms(identity, number); // recheck expiry after waiting on locks
        if (validSecret(oldSecret))
          await tx.phonePasswordChallenge.updateMany({
            where: {
              secretHash: hashToken(oldSecret),
              purpose: "INITIAL_PASSWORD",
              consumedAt: null,
            },
            data: { consumedAt: new Date() },
          });
        await tx.phonePasswordChallenge.create({
          data: {
            phoneNumber: number,
            secretHash: hashToken(secret),
            proofEventHash: proofEventHash(identity, "PHONE", number),
            expectedUserId: owner?.id ?? null,
            securityStamp: owner ? securityStamp(owner, owner.accountIdentities) : null,
            expiresAt,
          },
        });
      });
      return { secret, expiresAt: expiresAt.toISOString() };
    });
  },

  async status(secret?: string) {
    if (!phonePasswordEnabled()) return { enabled: false, pending: false };
    return sanitized(async () => {
      if (!validSecret(secret)) return { enabled: true, pending: false };
      const op = await prisma.phonePasswordChallenge.findUnique({
        where: { secretHash: hashToken(secret), purpose: "INITIAL_PASSWORD" },
      });
      if (!op || op.consumedAt || op.expiresAt.getTime() <= Date.now())
        return { enabled: true, pending: false };
      return { enabled: true, pending: true, expiresAt: op.expiresAt.toISOString() };
    });
  },

  async cancel(secret?: string) {
    requirePhonePassword();
    return sanitized(async () => {
      if (validSecret(secret))
        await prisma.phonePasswordChallenge.updateMany({
          where: { secretHash: hashToken(secret), purpose: "INITIAL_PASSWORD", consumedAt: null },
          data: { consumedAt: new Date() },
        });
    });
  },

  async complete(
    secret: string | undefined,
    raw: { password: string; passwordConfirmation: string },
    context: SessionContext,
  ) {
    requirePhonePassword();
    const input = phonePasswordCompleteSchema.parse(raw);
    return sanitized(async () => {
      if (!validSecret(secret)) throw invalid();
      const op = await prisma.phonePasswordChallenge.findUnique({
        where: { secretHash: hashToken(secret), purpose: "INITIAL_PASSWORD" },
      });
      if (!op || op.consumedAt || op.expiresAt.getTime() <= Date.now()) throw invalid();
      const passwordHash = await hashPassword(input.password);
      const user = await prisma.$transaction(async (tx) => {
        // Match A2/reset lock ordering: user before identifier; missing owners
        // remain missing. No late-created account is adopted by a pending setup.
        if (op.expectedUserId) await lockOwner(tx, op.expectedUserId);
        await lockPhone(tx, op.phoneNumber);
        const current = await tx.phonePasswordChallenge.findUnique({ where: { id: op.id } });
        if (!current || current.consumedAt || current.expiresAt.getTime() <= Date.now())
          throw invalid();
        let owner = await resolveOwner(tx, op.phoneNumber);
        if ((owner?.id ?? null) !== op.expectedUserId) throw ownership();
        if (owner) {
          assertFirstPasswordOwner(owner, op.phoneNumber, op.expectedUserId!);
          if (securityStamp(owner, owner.accountIdentities) !== op.securityStamp) throw invalid();
        }
        const claimed = await tx.phonePasswordChallenge.updateMany({
          where: { id: op.id, consumedAt: null, expiresAt: { gt: new Date() } },
          data: { consumedAt: new Date() },
        });
        if (claimed.count !== 1) throw invalid();
        if (!owner) {
          owner = {
            ...(await tx.user.create({
              data: { email: placeholder(op.phoneNumber), passwordHash, hasUsablePassword: true },
            })),
            accountIdentities: [],
          };
        } else {
          owner = {
            ...(await tx.user.update({
              where: { id: owner.id },
              data: { passwordHash, hasUsablePassword: true },
            })),
            accountIdentities: owner.accountIdentities,
          };
          // Initial credential establishment invalidates old refresh sessions and
          // unfinished reset/link proofs without touching health relations.
          await tx.refreshToken.updateMany({
            where: { userId: owner.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.accountToken.updateMany({
            where: { userId: owner.id, type: "PASSWORD_RESET", usedAt: null },
            data: { usedAt: new Date() },
          });
          await tx.accountIdentityOperation.updateMany({
            where: { userId: owner.id, consumedAt: null },
            data: { consumedAt: new Date() },
          });
          // #49's session version exists only in its combined schema. Use the
          // queried version to update it in the SAME locked transaction.
          if ("authVersion" in owner) {
            await tx.$executeRaw`UPDATE users SET "authVersion" = "authVersion" + 1 WHERE id = ${owner.id}`;
            owner = {
              ...(await tx.user.findUniqueOrThrow({ where: { id: owner.id } })),
              accountIdentities: owner.accountIdentities,
            };
          }
        }
        await recordVerifiedAccountIdentity(tx, {
          userId: owner.id,
          kind: "PHONE",
          identifier: op.phoneNumber,
          verifiedAt: new Date(),
        });
        return tx.user.update({ where: { id: owner.id }, data: { lastLoginAt: new Date() } });
      });
      return issueAuthSession(user, context);
    });
  },

  async login(raw: { phoneNumber: string; password: string }, context: SessionContext) {
    requirePhonePassword();
    const input = phonePasswordLoginSchema.parse(raw);
    return sanitized(async () => {
      await budget("login", input.phoneNumber, 10);
      const owner = await prisma.$transaction((tx) => resolveOwner(tx, input.phoneNumber));
      const verified = owner?.accountIdentities.some(
        (x) => x.kind === "PHONE" && x.identifier === input.phoneNumber,
      );
      if (
        !owner ||
        !verified ||
        owner.hasUsablePassword === false ||
        owner.deletionRequestedAt ||
        owner.role !== "USER" ||
        !owner.isActive
      ) {
        // Reuse the existing verifier's timing mitigation without authenticating
        // a real account or a fabricated placeholder through an email guess.
        await authService.login(
          {
            email: `missing.${crypto.randomUUID()}@phone.diewish.invalid`,
            password: input.password,
          },
          context,
        );
        throw ApiError.unauthorized("Invalid phone number or password.");
      }
      // The SAME User.passwordHash, password verifier, authVersion (#49),
      // refresh-token rotation and session issuer as ordinary email sign-in.
      return authService.login({ email: owner.email, password: input.password }, context);
    });
  },

  async legacySmsLogin(identity: VerifiedExternalIdentity, context: SessionContext) {
    requirePhonePassword();
    return sanitized(async () => {
      const number = requireSms(identity);
      const user = await prisma.$transaction(async (tx) => {
        const original = await resolveOwner(tx, number);
        if (!original)
          throw new ApiError(
            409,
            "Complete SMS verification and password setup before registration.",
            { code: "PHONE_REGISTRATION_REQUIRED" },
          );
        await lockOwner(tx, original.id);
        await lockPhone(tx, number);
        const owner = await resolveOwner(tx, number);
        if (!owner || owner.id !== original.id || owner.email.toLowerCase() !== placeholder(number))
          throw ownership();
        if (owner.accountIdentities.some((x) => x.kind === "PHONE" && x.identifier !== number))
          throw ownership();
        if (owner.hasUsablePassword === true) throw passwordRequired();
        if (owner.deletionRequestedAt || owner.role !== "USER") throw ownership();
        if (!owner.isActive && !owner.deactivatedAt) throw ownership();
        requireSms(identity, number);
        // Only an original SMS account may keep its old transition channel.
        return tx.user.update({
          where: { id: owner.id },
          data: { isActive: true, deactivatedAt: null, lastLoginAt: new Date() },
        });
      });
      return issueAuthSession(user, context);
    });
  },
};
