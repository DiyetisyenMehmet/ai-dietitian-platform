/** Payment/subscription domain types mirroring the backend REST contract. */

export type SubscriptionTier = "FREE" | "PREMIUM" | "PREMIUM_PLUS";
export type PaidTier = Exclude<SubscriptionTier, "FREE">;

export interface PurchaseAcceptance {
  termsVersion: string;
  distanceSalesAccepted: true;
  deliveryRefundAccepted: true;
  immediateDigitalPerformanceRequested: true;
}

/** Public plan catalog row returned by `GET /subscription/plans`. */
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
  purchaseTermsVersion: string;
}

export type BackendSubscriptionStatus =
  | "NONE"
  | "PENDING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "EXPIRED";

export interface SubscriptionStatusDto {
  tier: SubscriptionTier;
  status: BackendSubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  entitlements: string[];
}

export interface PaymentDto {
  id: string;
  createdAt: string;
  updatedAt: string;
  subscriptionId: string | null;
  provider: "IYZICO";
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
  amountMinor: number;
  currency: string;
  providerPaymentId: string | null;
  providerConversationId: string | null;
  failureReason: string | null;
}

export interface CheckoutResult {
  subscriptionId: string;
  providerToken: string;
  paymentPageUrl?: string;
  checkoutFormContent?: string;
}

/** Legacy presentation aliases retained for components while backend wiring lands. */
export type BillingCycle = "monthly" | "yearly";
export type SubscriptionStatus = "active" | "canceled" | "past_due";

export interface UserSubscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  cycle: BillingCycle;
  startedAt: string;
  renewsAt: string;
  cancelAtPeriodEnd: boolean;
}

export interface BillingHistoryEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: "paid" | "refunded" | "failed";
  invoiceNo: string;
}

/** Diewish does not persist card details; hosted payment provider owns them. */
export interface PaymentMethod {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName: string;
}
