import crypto from "node:crypto";

import type { User } from "@prisma/client";

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Contextual metadata captured for a session (best-effort, for auditing). */
export interface SessionContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

/** Public-safe representation of a user (never leaks the password hash). */
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
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
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

/**
 * Creates and persists a new refresh token for a user, returning the signed
 * token string. The DB record id is generated up-front and used as the JWT
 * `jti`, so a single insert carries the correct hash (no placeholder row).
 */
async function issueRefreshToken(userId: string, context: SessionContext): Promise<string> {
  const tokenId = crypto.randomUUID();
  const token = signRefreshToken({ userId, tokenId });
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * MS_PER_DAY);

  await authRepository.createRefreshToken({
    id: tokenId,
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: context.userAgent ?? null,
    ipAddress: context.ipAddress ?? null,
  });

  return token;
}

async function issueTokens(user: User, context: SessionContext): Promise<AuthTokens> {
  const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = await issueRefreshToken(user.id, context);
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: env.JWT_ACCESS_TTL,
  };
}

export const authService = {
  /** Registers a new account and returns the user with an initial token pair. */
  async register(input: RegisterInput, context: SessionContext): Promise<AuthResult> {
    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) {
      throw ApiError.conflict("An account with this email already exists.");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await authRepository.createUser({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
    });

    logger.info({ userId: user.id }, "New user registered");
    const tokens = await issueTokens(user, context);
    return { user: toPublicUser(user), tokens };
  },

  /** Authenticates credentials and returns the user with a fresh token pair. */
  async login(input: LoginInput, context: SessionContext): Promise<AuthResult> {
    const user = await authRepository.findUserByEmail(input.email);

    // Uniform failure for unknown-email vs bad-password to avoid user enumeration.
    const invalid = ApiError.unauthorized("Invalid email or password.");
    if (!user) {
      // Still perform a hash comparison against a dummy value to reduce timing
      // signal, then fail.
      await verifyPassword(input.password, "$2a$12$" + "x".repeat(53));
      throw invalid;
    }

    const passwordOk = await verifyPassword(input.password, user.passwordHash);
    if (!passwordOk) {
      throw invalid;
    }

    if (!user.isActive) {
      throw ApiError.forbidden("This account has been deactivated.");
    }

    await authRepository.updateLastLogin(user.id);
    logger.info({ userId: user.id }, "User logged in");
    const tokens = await issueTokens(user, context);
    return { user: toPublicUser(user), tokens };
  },

  /**
   * Rotates a refresh token: validates it, revokes the presented token, and
   * issues a brand-new pair. Detects reuse of an already-revoked token and, as
   * a safety response, revokes the user's entire active token set.
   */
  async refresh(refreshTokenRaw: string, context: SessionContext): Promise<AuthResult> {
    let claims: { sub: string; jti: string };
    try {
      claims = verifyRefreshToken(refreshTokenRaw);
    } catch {
      throw ApiError.unauthorized("Invalid or expired refresh token.");
    }

    const record = await authRepository.findRefreshTokenById(claims.jti);
    if (!record || record.userId !== claims.sub) {
      throw ApiError.unauthorized("Invalid or expired refresh token.");
    }

    // Reuse detection: a token already revoked is being presented again.
    if (record.revokedAt) {
      logger.warn(
        { userId: record.userId, tokenId: record.id },
        "Refresh token reuse detected — revoking all sessions",
      );
      await authRepository.revokeAllForUser(record.userId);
      throw ApiError.unauthorized("Refresh token has already been used.");
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw ApiError.unauthorized("Invalid or expired refresh token.");
    }

    // Defense-in-depth: the presented token must hash to the stored value.
    if (hashToken(refreshTokenRaw) !== record.tokenHash) {
      throw ApiError.unauthorized("Invalid or expired refresh token.");
    }

    const user = await authRepository.findUserById(record.userId);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized("Invalid or expired refresh token.");
    }

    // Rotate: mint the successor first, then revoke the old one pointing to it.
    const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
    const newRefreshToken = await issueRefreshToken(user.id, context);
    const successorId = verifyRefreshToken(newRefreshToken).jti;
    await authRepository.revokeRefreshToken(record.id, successorId);

    return {
      user: toPublicUser(user),
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
        tokenType: "Bearer",
        expiresIn: env.JWT_ACCESS_TTL,
      },
    };
  },

  /**
   * Logs out by revoking the presented refresh token. Idempotent and quiet: an
   * invalid/expired token is treated as already-logged-out rather than erroring.
   */
  async logout(refreshTokenRaw: string): Promise<void> {
    try {
      const claims = verifyRefreshToken(refreshTokenRaw);
      await authRepository.revokeRefreshToken(claims.jti);
    } catch {
      // Intentionally ignore — logout must not leak token validity.
    }
  },

  /** Returns the public profile for an authenticated user id. */
  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw ApiError.unauthorized("Session is no longer valid.");
    }
    return toPublicUser(user);
  },
};
