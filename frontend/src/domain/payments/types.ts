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

/** Billing cadence for a paid subscription. */
export type BillingCycle = "monthly" | "yearly";

/** Lifecycle status of a user's subscription. */
export type SubscriptionStatus = "active" | "canceled" | "past_due";

/** The authenticated user's current subscription state. */
export interface UserSubscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  cycle: BillingCycle;
  /** ISO date the plan started. */
  startedAt: string;
  /** ISO date the plan renews (or ends, if canceled). */
  renewsAt: string;
  /** When true, the plan will not auto-renew and ends at `renewsAt`. */
  cancelAtPeriodEnd: boolean;
}

/** A single past payment / invoice line. */
export interface BillingHistoryEntry {
  id: string;
  /** ISO date the charge was made. */
  date: string;
  description: string;
  /** Amount in TRY (major units). */
  amount: number;
  status: "paid" | "refunded" | "failed";
  /** Masked reference, e.g. invoice number. */
  invoiceNo: string;
}

/** A saved payment method (masked card). */
export interface PaymentMethod {
  brand: string;
  /** Last four digits of the card. */
  last4: string;
  expMonth: number;
  expYear: number;
  holderName: string;
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
