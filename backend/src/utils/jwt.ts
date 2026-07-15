import crypto from "node:crypto";

import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

import { env } from "../config/env";
import type { UserRole } from "@prisma/client";

/**
 * JWT utilities for the auth module.
 *
 * Two token types are issued with *separate* secrets:
 *  - access  — short-lived, sent on every request (Authorization: Bearer).
 *  - refresh — longer-lived, exchanged for a new access token. Its `jti`
 *              maps to a persisted `RefreshToken` row enabling rotation and
 *              reuse detection (the DB is the source of truth for validity).
 */

export interface AccessTokenClaims extends JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  type: "access";
}

export interface RefreshTokenClaims extends JwtPayload {
  sub: string;
  jti: string;
  type: "refresh";
}

/** Signs a short-lived access token. */
export function signAccessToken(params: {
  userId: string;
  email: string;
  role: UserRole;
}): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"],
    issuer: env.JWT_ISSUER,
    subject: params.userId,
  };
  return jwt.sign(
    { email: params.email, role: params.role, type: "access" },
    env.JWT_ACCESS_SECRET,
    options,
  );
}

/**
 * Signs a refresh token bound to a specific persisted record (`jti`). The
 * caller is responsible for having created that record first.
 */
export function signRefreshToken(params: { userId: string; tokenId: string }): string {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_TTL as SignOptions["expiresIn"],
    issuer: env.JWT_ISSUER,
    subject: params.userId,
    jwtid: params.tokenId,
  };
  return jwt.sign({ type: "refresh" }, env.JWT_REFRESH_SECRET, options);
}

/** Verifies an access token's signature/claims. Throws on any invalidity. */
export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: env.JWT_ISSUER,
  }) as AccessTokenClaims;
  if (decoded.type !== "access") {
    throw new jwt.JsonWebTokenError("Invalid token type");
  }
  return decoded;
}

/** Verifies a refresh token's signature/claims. Throws on any invalidity. */
export function verifyRefreshToken(token: string): RefreshTokenClaims {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: env.JWT_ISSUER,
  }) as RefreshTokenClaims;
  if (decoded.type !== "refresh" || !decoded.jti) {
    throw new jwt.JsonWebTokenError("Invalid token type");
  }
  return decoded;
}

/**
 * Stable SHA-256 hash of a token string. Stored (not the token itself) so a
 * leaked database cannot be used to reconstruct valid refresh tokens.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
