/**
 * Payment-provider abstraction (Sprint 15, D2).
 *
 * The rest of the app depends only on this interface, never on iyzico
 * directly. Adding a second processor later (e.g. Stripe — roadmap F9) means
 * implementing this interface and selecting it in the factory; no service or
 * controller code changes. Every method is provider-agnostic and speaks the
 * normalized types from `../types`.
 */

import type {
  InitializeCheckoutInput,
  InitializeCheckoutResult,
  ParsedWebhookEvent,
  ProviderPaymentResult,
} from "../types";

export interface PaymentProvider {
  /** Stable provider identifier, matching the `PaymentProvider` enum value. */
  readonly id: "IYZICO";

  /** True when the provider has the credentials it needs to operate. */
  isConfigured(): boolean;

  /** Starts a hosted-checkout flow and returns the token/URL for the client. */
  initializeCheckout(input: InitializeCheckoutInput): Promise<InitializeCheckoutResult>;

  /** Retrieves the finalized payment for a checkout token (callback handling). */
  retrievePayment(providerToken: string): Promise<ProviderPaymentResult>;

  /**
   * Verifies an inbound webhook's signature against the configured secret.
   * MUST be constant-time and MUST return false when no secret is configured
   * (fail closed — an unverified webhook must never grant paid access).
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean;

  /** Parses a raw webhook body into a normalized event. */
  parseWebhook(payload: unknown): ParsedWebhookEvent;
}
