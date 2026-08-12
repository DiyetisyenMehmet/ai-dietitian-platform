/**
 * Shared types for Diewish's AI Usage Quota capability (Sprint 14, C5).
 */

import type { AiUsageFeature, SubscriptionTier } from "@prisma/client";

/** Usage counted against a single rolling window plus its limit. */
export interface WindowUsage {
  /** Calls already consumed in the window. */
  used: number;
  /** The window's limit (`null` = unlimited). */
  limit: number | null;
  /** Calls remaining (`null` = unlimited). */
  remaining: number | null;
  /** UTC instant at which the window resets. */
  resetsAt: Date;
}

/**
 * FREE-tier LIFETIME trial status for a feature. Present only for the FREE tier;
 * absent (undefined) for paid tiers, which use the rolling day/month windows.
 */
export interface TrialUsage {
  /** Total non-resetting allowance for the FREE tier. */
  limit: number;
  /** Successful calls consumed so far (lifetime). */
  used: number;
  /** Calls remaining before an upgrade is required. */
  remaining: number;
  /** True when the lifetime trial is exhausted (upgrade required). */
  exhausted: boolean;
}

/** A feature's full quota status for the current day and month. */
export interface FeatureQuotaStatus {
  feature: AiUsageFeature;
  tier: SubscriptionTier;
  day: WindowUsage;
  month: WindowUsage;
  /**
   * FREE-tier lifetime trial status (undefined for paid tiers). Lets clients
   * show "N free uses left" and a paywall proactively.
   */
  trial?: TrialUsage;
  /** True when at least one window OR the FREE lifetime trial is exhausted. */
  exceeded: boolean;
}

/** Metadata describing the AI call to record after a successful invocation. */
export interface RecordUsageInput {
  userId: string;
  feature: AiUsageFeature;
  provider: string;
  model: string;
  /** Optional best-effort token estimate for cost observability. */
  estimatedTokens?: number;
}
