/**
 * Payment/subscription domain types shared across the frontend. These mirror
 * the backend REST contract delivered in Sprint 15 (payments module).
 */

/** Subscription tiers offered by Diewish. */
export type SubscriptionTier = "FREE" | "PREMIUM" | "PREMIUM_PLUS";

/** Paid tiers that can be purchased through iyzico checkout. */
export type PaidTier = Exclude<SubscriptionTier, "FREE">;

/** A plan as returned by the public `GET /subscription/plans` endpoint. */
export interface PlanDto {
  tier: SubscriptionTier;
  code: string;
  name: string;
  priceMinor: number;
  price: string;
  currency: string;
  periodDays: number;
  description: string;
  entitlements: string[];
}

/** Result of initiating a hosted checkout (`POST /payments/checkout`). */
export interface CheckoutResult {
  subscriptionId: string;
  providerToken: string;
  /** Hosted payment page URL the client should open, when provided. */
  paymentPageUrl?: string;
  /** Embeddable checkout form HTML, when the provider returns content instead. */
  checkoutFormContent?: string;
}
