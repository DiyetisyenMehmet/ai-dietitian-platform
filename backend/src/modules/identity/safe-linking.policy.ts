import crypto from "node:crypto";
import type { AccountIdentity, User } from "@prisma/client";
import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";
import type { VerifiedExternalIdentity } from "./firebase-auth.provider";

export const LINK_TTL_MS = 5 * 60_000;
export const MAX_LINK_ATTEMPTS = 5;
export const linkUnavailable = () =>
  new ApiError(503, "Account linking is not enabled.", { code: "ACCOUNT_LINKING_DISABLED" });
export const ownershipRequired = () =>
  new ApiError(409, "Verify your existing Diewish account before continuing.", {
    code: "ACCOUNT_OWNERSHIP_REQUIRED",
  });
export const invalidLink = () =>
  new ApiError(400, "This verification is invalid or has expired.", {
    code: "ACCOUNT_LINK_PROOF_INVALID",
  });
export function requireSafeLinking(): void {
  if (!env.ACCOUNT_SAFE_LINKING_ENABLED) throw linkUnavailable();
}
export function assertLinkableUser(user: User | null): asserts user is User {
  if (
    !user ||
    user.role !== "USER" ||
    !user.isActive ||
    user.deletionRequestedAt ||
    user.email.endsWith("@guest.diewish.invalid")
  ) {
    throw ApiError.forbidden("This account cannot link identities.");
  }
}
export function securityStamp(user: User, identities: AccountIdentity[]): string {
  // Password resets (including #49), method changes and role/lifecycle changes
  // invalidate outstanding operations. No password hash is copied into the table.
  const state = JSON.stringify([
    user.passwordHash,
    user.email,
    user.role,
    user.isActive,
    user.deactivatedAt,
    user.deletionRequestedAt,
    identities
      .map((x) => [x.id, x.kind, x.identifier, x.verifiedAt])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ]);
  return crypto.createHmac("sha256", env.JWT_REFRESH_SECRET).update(state).digest("hex");
}
export function requireFreshExternal(identity: VerifiedExternalIdentity): void {
  const time = identity.authTime;
  if (
    !time ||
    !Number.isInteger(time) ||
    time * 1000 > Date.now() + 30_000 ||
    Date.now() - time * 1000 >= LINK_TTL_MS
  )
    throw invalidLink();
}
export function proofEventHash(
  identity: VerifiedExternalIdentity,
  kind: string,
  identifier: string,
): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([identity.uid, identity.authTime, kind, identifier]))
    .digest("hex");
}
