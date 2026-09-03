import { z } from "zod";

import { PURCHASE_TERMS_VERSION } from "../constants";

/** Only paid tiers can be purchased; FREE is the default and never checked out. */
export const checkoutSchema = z.object({
  tier: z.enum(["PREMIUM", "PREMIUM_PLUS"]),
  purchaseAcceptance: z.object({
    termsVersion: z.literal(PURCHASE_TERMS_VERSION),
    distanceSalesAccepted: z.literal(true),
    deliveryRefundAccepted: z.literal(true),
    immediateDigitalPerformanceRequested: z.literal(true),
  }),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Finalize a checkout from the provider token returned to the callback page. */
export const verifyPaymentSchema = z.object({
  token: z.string().min(1).max(512),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

/** Cancel a subscription. */
export const cancelSubscriptionSchema = z.object({
  atPeriodEnd: z.boolean().default(true),
});
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
