import { createHmac } from "node:crypto";
import type { SubscriptionTier } from "@prisma/client";

export type ScanQuotaFeature = "PHOTO_SCAN" | "BARCODE_SCAN";
export const SCAN_QUOTA_LIMIT = 3;
export const SCAN_QUOTA_LEASE_MS = 5 * 60_000;

export interface ScanQuotaConfiguration {
  SCAN_QUOTA_FOUNDATION_ENABLED: boolean;
  SCAN_QUOTA_HASH_SECRET: string;
  NODE_ENV: string;
  DIEWISH_ENVIRONMENT?: string;
  DATABASE_URL: string;
}

/** Not a launch flag: Phase 2A can only be exercised in isolated tests. */
export function scanQuotaEnabled(config: ScanQuotaConfiguration): boolean {
  if (
    config.SCAN_QUOTA_FOUNDATION_ENABLED !== true ||
    config.NODE_ENV !== "test" ||
    config.DIEWISH_ENVIRONMENT !== "test"
  )
    return false;
  try {
    const database = new URL(config.DATABASE_URL);
    return (
      ["postgresql:", "postgres:"].includes(database.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) &&
      database.pathname === "/diewish_scan_quota_test"
    );
  } catch {
    return false;
  }
}

export type ScanQuotaReason =
  | "SCAN_QUOTA_FOUNDATION_DISABLED"
  | "SCAN_QUOTA_PAID_POLICY_UNDEFINED"
  | "FREE_SCAN_QUOTA_EXHAUSTED"
  | "SCAN_QUOTA_IN_PROGRESS"
  | null;

export interface ScanQuotaStatus {
  feature: ScanQuotaFeature;
  policyVersion: "scan-foundation-v1";
  tier: SubscriptionTier | null;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  inFlight: number | null;
  allowed: boolean;
  reason: ScanQuotaReason;
  resetsAt: null;
  serverNow: string;
}

export function scanQuotaStatus(
  feature: ScanQuotaFeature,
  tier: SubscriptionTier | null,
  now: Date,
  counts?: { used: number; inFlight: number },
): ScanQuotaStatus {
  const limited = tier === "FREE" && counts;
  const remaining = limited ? Math.max(0, SCAN_QUOTA_LIMIT - counts.used) : null;
  const allowed = !!limited && counts.used + counts.inFlight < SCAN_QUOTA_LIMIT;
  return {
    feature,
    policyVersion: "scan-foundation-v1",
    tier,
    limit: limited ? SCAN_QUOTA_LIMIT : null,
    used: limited ? counts.used : null,
    remaining,
    inFlight: limited ? counts.inFlight : null,
    allowed,
    reason:
      tier === null
        ? "SCAN_QUOTA_FOUNDATION_DISABLED"
        : tier !== "FREE"
          ? "SCAN_QUOTA_PAID_POLICY_UNDEFINED"
          : remaining === 0
            ? "FREE_SCAN_QUOTA_EXHAUSTED"
            : !allowed
              ? "SCAN_QUOTA_IN_PROGRESS"
              : null,
    resetsAt: null,
    serverNow: now.toISOString(),
  };
}

/** A dedicated stable test secret; no plaintext images/barcodes in quota rows. */
export function scanQuotaDigest(
  secret: string,
  feature: ScanQuotaFeature,
  input: Uint8Array | string,
): string {
  return createHmac("sha256", secret).update(`${feature}:v1:`).update(input).digest("hex");
}
