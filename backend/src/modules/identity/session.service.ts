import crypto from "node:crypto";

import type { User } from "@prisma/client";

import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt";
import type { IdentityRequestContext, IdentitySessionResult, PublicIdentityUser } from "./identity.types";

function isSyntheticEmail(email: string): boolean {
  return email.endsWith("@phone.diewish.invalid") || email.endsWith("@guest.diewish.invalid") || email.endsWith("@social.diewish.invalid");
}

function toPublicUser(
  user: User,
  extra: { isGuest?: boolean; phoneNumber?: string | null; emailVerified?: boolean } = {},
): PublicIdentityUser {
  return {
    id: user.id,
    email: isSyntheticEmail(user.email) ? null : user.email,
    phoneNumber: extra.phoneNumber ?? null,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    isGuest: extra.isGuest ?? false,
    emailVerified: extra.emailVerified ?? user.emailVerifiedAt !== null,
    phoneVerified: Boolean(extra.phoneNumber),
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function issueIdentitySession(
  user: User,
  context: IdentityRequestContext,
  extra: { isGuest?: boolean; phoneNumber?: string | null; emailVerified?: boolean } = {},
): Promise<IdentitySessionResult> {
  const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
  const result: IdentitySessionResult = {
    user: toPublicUser(user, extra),
    tokens: { accessToken, tokenType: "Bearer", expiresIn: env.JWT_ACCESS_TTL },
  };

  if (extra.isGuest) return result;

  const tokenId = crypto.randomUUID();
  const raw = signRefreshToken({ userId: user.id, tokenId });
  const claims = verifyRefreshToken(raw);
  if (!claims.exp) throw new Error("Refresh token expiry was not generated");
  const expiresAt = new Date(claims.exp * 1000);

  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt,
      userAgent: context.userAgent ?? null,
      ipAddress: context.ipAddress ?? null,
    },
  });

  result.refreshToken = raw;
  result.refreshExpiresAt = expiresAt;
  return result;
}
