/**
 * Payment/subscription domain types (Sprint 15).
 *
 * These are provider-agnostic shapes: the payment-provider abstraction speaks
 * in these terms so the rest of the app never depends on iyzico's wire format.
 */

import type { SubscriptionTier } from "@prisma/client";

/** Buyer context handed to the provider to initialize a hosted checkout. */
export interface CheckoutBuyer {
  id: string;
  email: string;
  /** Best-effort display name; the provider requires name/surname fields. */
  fullName?: string | null;
  ipAddress?: string | null;
}

/** Input to start a hosted-checkout flow for a plan. */
export interface InitializeCheckoutInput {
  /** Our own correlation id (also stored on the pending subscription/payment). */
  conversationId: string;
  tier: SubscriptionTier;
  priceMinor: number;
  currency: string;
  planName: string;
  planCode: string;
  buyer: CheckoutBuyer;
  /** URL the provider redirects the user back to after payment. */
  callbackUrl: string;
}

/** Result of initializing a hosted checkout. */
export interface InitializeCheckoutResult {
  /** Provider token used later to retrieve the finalized payment. */
  providerToken: string;
  /** Hosted payment page URL (or form content) the client must open. */
  paymentPageUrl?: string;
  /** Raw HTML form content when the provider returns embeddable content. */
  checkoutFormContent?: string;
}

/** Normalized outcome of a payment, mapped from a provider status. */
export type NormalizedPaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED";

/** Normalized payment detail retrieved from the provider. */
export interface ProviderPaymentResult {
  status: NormalizedPaymentStatus;
  /** Provider's own status string, preserved for reconciliation. */
  rawStatus: string;
  providerPaymentId?: string | null;
  /** Our correlation id echoed back by the provider, when available. */
  conversationId?: string | null;
  paidPriceMinor?: number | null;
  currency?: string | null;
  failureReason?: string | null;
}

/** A parsed, signature-checked inbound webhook event. */
export interface ParsedWebhookEvent {
  /** Provider-unique id used for idempotent processing. */
  providerEventId: string;
  eventType: string;
  /** Correlation id linking the event to a pending subscription/payment. */
  conversationId?: string | null;
  providerPaymentToken?: string | null;
  rawStatus?: string | null;
}
