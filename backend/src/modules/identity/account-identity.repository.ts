import { Prisma, type AccountIdentityKind } from "@prisma/client";
import { z } from "zod";

import { ApiError } from "../../utils/api-error";

const conflict = () =>
  new ApiError(409, "This identity cannot be linked automatically.", {
    code: "ACCOUNT_IDENTITY_CONFLICT",
  });

export function normalizeAccountIdentifier(kind: AccountIdentityKind, value: string): string {
  let normalized: string;
  if (kind === "EMAIL") {
    normalized = value.trim().toLowerCase();
    if (
      !z.string().email().max(320).safeParse(normalized).success ||
      normalized.endsWith(".diewish.invalid")
    ) {
      throw ApiError.badRequest("Invalid account identifier.");
    }
  } else if (kind === "PHONE") {
    // Callers must supply a server-verified E.164 value, never guess a country.
    normalized = value;
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      throw ApiError.badRequest("Invalid account identifier.");
    }
  } else if (kind === "GOOGLE") {
    // Google's stable provider subject, NOT its mutable email or Firebase UID.
    normalized = value;
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(normalized)) {
      throw ApiError.badRequest("Invalid account identifier.");
    }
  } else {
    throw ApiError.badRequest("Invalid identity kind.");
  }
  return normalized;
}

/**
 * Internal persistence primitive, NOT a linking authorization service.
 * Phase 1 has NO production caller and NO HTTP write route. A later approved
 * flow must consume fresh single-use ownership proof + reauthentication in the
 * SAME transaction before calling this. No login/recovery reads this registry.
 * It never creates, merges, moves, reactivates or deletes a User.
 */
export async function recordVerifiedAccountIdentity(
  tx: Prisma.TransactionClient,
  input: { userId: string; kind: AccountIdentityKind; identifier: string; verifiedAt: Date },
): Promise<void> {
  const identifier = normalizeAccountIdentifier(input.kind, input.identifier);
  const verifiedTime = input.verifiedAt.getTime();
  if (!Number.isFinite(verifiedTime) || verifiedTime > Date.now()) {
    throw ApiError.badRequest("Invalid verification timestamp.");
  }
  try {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, isActive: true, role: true, deletionRequestedAt: true, email: true },
    });
    if (
      !user?.isActive ||
      user.role !== "USER" ||
      user.deletionRequestedAt ||
      user.email.endsWith("@guest.diewish.invalid")
    ) {
      throw ApiError.forbidden("This account cannot link identities.");
    }

    // Reserve existing legacy identifiers too. A new registry must not steal
    // an address/phone merely because the legacy user has no registry row.
    const legacyEmail =
      input.kind === "EMAIL"
        ? identifier
        : input.kind === "PHONE"
          ? `phone.${identifier.slice(1)}@phone.diewish.invalid`
          : null;
    if (legacyEmail) {
      const legacyOwner = await tx.user.findFirst({
        where: { email: { equals: legacyEmail, mode: "insensitive" }, id: { not: input.userId } },
        select: { id: true },
      });
      if (legacyOwner) throw conflict();
    }
    const existing = await tx.accountIdentity.findUnique({
      where: { kind_identifier: { kind: input.kind, identifier } },
    });
    if (existing) {
      if (existing.userId !== input.userId) throw conflict();
      return;
    }
    const inserted = await tx.accountIdentity.createMany({
      data: [{ ...input, identifier }],
      skipDuplicates: true,
    });
    if (inserted.count !== 1) {
      const winner = await tx.accountIdentity.findUnique({
        where: { kind_identifier: { kind: input.kind, identifier } },
        select: { userId: true },
      });
      if (winner?.userId !== input.userId) throw conflict();
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflict();
    }
    // Prisma exceptions can embed SQL/identifiers. Never propagate them to the
    // request logger; retain only this fixed, non-identifying error.
    throw ApiError.internal("Account identity could not be recorded.");
  }
}
