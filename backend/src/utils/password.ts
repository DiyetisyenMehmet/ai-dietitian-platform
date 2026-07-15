import bcrypt from "bcryptjs";

import { env } from "../config/env";

/**
 * Password hashing utilities.
 *
 * We use bcrypt (via the pure-JS `bcryptjs`, which avoids native build steps
 * and behaves identically across environments/CI). The plaintext password is
 * never persisted — only the resulting hash. The cost factor is configurable
 * via `BCRYPT_ROUNDS`.
 */

/** Hashes a plaintext password with the configured bcrypt cost factor. */
export async function hashPassword(plaintext: string): Promise<string> {
  const salt = await bcrypt.genSalt(env.BCRYPT_ROUNDS);
  return bcrypt.hash(plaintext, salt);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash. Returns false
 * (rather than throwing) if the stored hash is malformed, so callers can treat
 * any failure as an authentication failure without leaking details.
 */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}
