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

/** A feature's full quota status for the current day and month. */
export interface FeatureQuotaStatus {
  feature: AiUsageFeature;
  tier: SubscriptionTier;
  day: WindowUsage;
  month: WindowUsage;
  /** True when at least one window is exhausted (a call would be blocked). */
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
