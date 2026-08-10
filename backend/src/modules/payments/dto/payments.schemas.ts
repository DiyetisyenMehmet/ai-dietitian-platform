/**
 * Request validation schemas for the subscription/payments module (Sprint 15).
 */

import { z } from "zod";

/** Only paid tiers can be purchased; FREE is the default and never checked out. */
export const checkoutSchema = z.object({
  tier: z.enum(["PREMIUM", "PREMIUM_PLUS"]),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Finalize a checkout from the provider token returned to the callback page. */
export const verifyPaymentSchema = z.object({
  token: z.string().min(1).max(512),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

/**
 * Cancel a subscription. `atPeriodEnd=true` (default) keeps access until the
 * paid term ends; `false` downgrades immediately.
 */
export const cancelSubscriptionSchema = z.object({
  atPeriodEnd: z.boolean().default(true),
});
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
