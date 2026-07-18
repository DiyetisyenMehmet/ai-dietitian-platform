"use client";

import { authStore } from "@/application/auth/auth-store";
import { ApiError } from "@/infrastructure/api/http-client";
import { paymentsClient } from "@/infrastructure/payments/payments-client";
import type { PaidTier } from "@/domain/payments/types";

/**
 * Outcome of a checkout attempt. The presentation layer decides how to act on
 * each variant (navigate, render the hosted form, or surface an error) so this
 * helper stays free of any DOM/router concerns.
 */
export type CheckoutOutcome =
  | { kind: "auth-required"; redirectTo: string }
  | { kind: "redirect"; url: string }
  | { kind: "form"; html: string }
  | { kind: "error"; message: string };

/**
 * Orchestrates the "Buy now" flow for a paid tier against the existing Sprint 15
 * iyzico backend. Unauthenticated visitors are routed to registration (carrying
 * the chosen plan); authenticated users receive a hosted payment page URL or an
 * embeddable checkout form from `POST /payments/checkout`.
 *
 * This does NOT re-implement payments — it consumes the established REST
 * contract and simply maps the response to a UI-actionable outcome.
 */
export async function beginCheckout(tier: PaidTier): Promise<CheckoutOutcome> {
  const { status } = authStore.getSnapshot();

  if (status !== "authenticated") {
    return { kind: "auth-required", redirectTo: `/register?plan=${tier}` };
  }

  try {
    const result = await paymentsClient.startCheckout(tier);

    if (result.paymentPageUrl) {
      return { kind: "redirect", url: result.paymentPageUrl };
    }
    if (result.checkoutFormContent) {
      return { kind: "form", html: result.checkoutFormContent };
    }
    return {
      kind: "error",
      message: "Ödeme sayfası başlatılamadı. Lütfen daha sonra tekrar deneyin.",
    };
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "Ödeme başlatılırken beklenmeyen bir hata oluştu.";
    return { kind: "error", message };
  }
}
