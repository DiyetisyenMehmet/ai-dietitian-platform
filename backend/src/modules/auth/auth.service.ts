import crypto from "node:crypto";

import { Prisma, type RefreshToken, type User } from "@prisma/client";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { ApiError } from "../../utils/api-error";
import { hashPassword, verifyPassword } from "../../utils/password";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt";
import { authRepository } from "./auth.repository";
import type { LoginInput, RegisterInput } from "./auth.schemas";

const CONCURRENT_REPLAY_GRACE_MS = 5_000;

export interface SessionContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string | null;
  role: User["role"];
  isActive: boolean;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface PreparedRefreshToken {
  id: string;
  raw: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerifiedAt !== null,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt.toISOString(),
  };
}

function prepareRefreshToken(userId: string, context: SessionContext): PreparedRefreshToken {
  const id = crypto.randomUUID();
  const raw = signRefreshToken({ userId, tokenId: id });
  const claims = verifyRefreshToken(raw);
  if (!claims.exp) {
    throw ApiError.internal("Refresh token expiry was not generated.");
  }

  return {
    id,
    raw,
    tokenHash: hashToken(raw),
    expiresAt: new Date(claims.exp * 1000),
    userAgent: context.userAgent ?? null,
    ipAddress: context.ipAddress ?? null,
  };
}

async function issueRefreshToken(
  userId: string,
  context: SessionContext,
): Promise<PreparedRefreshToken> {
  const prepared = prepareRefreshToken(userId, context);
  await authRepository.createRefreshToken({
    id: prepared.id,
    userId,
    tokenHash: prepared.tokenHash,
    expiresAt: prepared.expiresAt,
    userAgent: prepared.userAgent,
    ipAddress: prepared.ipAddress,
  });
  return prepared;
}

async function issueTokens(user: User, context: SessionContext): Promise<AuthResult> {
  const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refresh = await issueRefreshToken(user.id, context);
  return {
    user: toPublicUser(user),
    tokens: {
      accessToken,
      tokenType: "Bearer",
      expiresIn: env.JWT_ACCESS_TTL,
    },
    refreshToken: refresh.raw,
    refreshExpiresAt: refresh.expiresAt,
  };
}

function isLikelyConcurrentReplay(
  record: RefreshToken,
  context: SessionContext,
  observedAt: Date,
): boolean {
  if (!record.revokedAt || !record.replacedById) return false;
  const ageMs = observedAt.getTime() - record.revokedAt.getTime();
  if (ageMs < 0 || ageMs > CONCURRENT_REPLAY_GRACE_MS) return false;

  const userAgent = context.userAgent ?? null;
  const ipAddress = context.ipAddress ?? null;
  const userAgentCompatible =
    record.userAgent === userAgent || record.userAgent === null || userAgent === null;
  const ipCompatible = record.ipAddress === ipAddress || record.ipAddress === null || ipAddress === null;
  return userAgentCompatible && ipCompatible;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const authService = {
  async register(input: RegisterInput, context: SessionContext): Promise<AuthResult> {
    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) {
      throw ApiError.conflict("An account with this email already exists.");
    }

    const passwordHash = await hashPassword(input.password);
    let user: User;
    try {
      user = await authRepository.createUser({
        email: input.email,
        passwordHash,
        fullName: input.fullName,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw ApiError.conflict("An account with this email already exists.");
      }
      throw error;
    }

    logger.info({ userId: user.id }, "New user registered");
    return issueTokens(user, context);
  },

  async login(input: LoginInput, context: SessionContext): Promise<AuthResult> {
    const user = await authRepository.findUserByEmail(input.email);

    const invalid = ApiError.unauthorized("Invalid email or password.");
    if (!user) {
      await verifyPassword(input.password, "$2a$12$" + "x".repeat(53));
      throw invalid;
    }

    const passwordOk = await verifyPassword(input.password, user.passwordHash);
    if (!passwordOk) throw invalid;
    if (!user.isActive) throw ApiError.forbidden("This account has been deactivated.");

    await authRepository.updateLastLogin(user.id);
    logger.info({ userId: user.id }, "User logged in");
    return issueTokens(user, context);
  },

  async refresh(refreshTokenRaw: string, context: SessionContext): Promise<AuthResult> {
    let claims: { sub: string; jti: string };
    try {
      claims = verifyRefreshToken(refreshTokenRaw);
    } catch {
      throw ApiError.unauthorized("Invalid or expired refresh token.");
    }

    const claimAt = new Date();
    const successor = prepareRefreshToken(claims.sub, context);
    const rotation = await authRepository.rotateRefreshToken({
      tokenId: claims.jti,
      userId: claims.sub,
      presentedHash: hashToken(refreshTokenRaw),
      now: claimAt,
      successor: {
        id: successor.id,
        tokenHash: successor.tokenHash,
        expiresAt: successor.expiresAt,
        userAgent: successor.userAgent,
        ipAddress: successor.ipAddress,
      },
    });

    if (rotation.status === "invalid") {
      throw ApiError.unauthorized("Invalid or expired refresh token.");
    }

    if (rotation.status === "already_claimed") {
      const observedAt = new Date();
      if (!isLikelyConcurrentReplay(rotation.record, context, observedAt)) {
        logger.warn(
          { userId: rotation.record.userId, tokenId: rotation.record.id },
          "Refresh token reuse detected — revoking all sessions",
        );
        await authRepository.revokeAllForUser(rotation.record.userId);
      }
      throw ApiError.unauthorized("Refresh token has already been used.");
    }

    const user = rotation.user;
    const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
    return {
      user: toPublicUser(user),
      tokens: {
        accessToken,
        tokenType: "Bearer",
        expiresIn: env.JWT_ACCESS_TTL,
      },
      refreshToken: successor.raw,
      refreshExpiresAt: successor.expiresAt,
    };
  },

  async logout(refreshTokenRaw: string): Promise<void> {
    try {
      const claims = verifyRefreshToken(refreshTokenRaw);
      await authRepository.revokeRefreshToken(claims.jti);
    } catch {
      // Logout is intentionally idempotent and does not reveal token validity.
    }
  },

  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await authRepository.findUserById(userId);
    if (!user) throw ApiError.unauthorized("Session is no longer valid.");
    return toPublicUser(user);
  },
};
