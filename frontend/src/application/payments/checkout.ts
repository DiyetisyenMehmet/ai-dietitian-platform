"use client";

import { authStore } from "@/application/auth/auth-store";
import { ApiError } from "@/infrastructure/api/http-client";
import { paymentsClient } from "@/infrastructure/payments/payments-client";
import type { PaidTier } from "@/domain/payments/types";

/**
 * Outcome of a checkout attempt. Diewish only navigates to a provider-hosted
 * payment URL; provider-supplied HTML is never written into the Diewish origin.
 */
export type CheckoutOutcome =
  | { kind: "auth-required"; redirectTo: string }
  | { kind: "redirect"; url: string }
  | { kind: "error"; message: string };

/**
 * Orchestrates the paid-access checkout flow. Guests are routed to registration;
 * authenticated users may continue only when the backend returns a hosted
 * provider URL. If the provider returns embeddable HTML only, checkout fails
 * closed until a sandboxed/isolated presentation is explicitly implemented.
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

    return {
      kind: "error",
      message: result.checkoutFormContent
        ? "Ödeme sağlayıcısı yalnızca gömülü form döndürdü. Güvenli yönlendirme akışı tamamlanmadan ödeme açılamaz."
        : "Ödeme sayfası başlatılamadı. Lütfen daha sonra tekrar deneyin.",
    };
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "Ödeme başlatılırken beklenmeyen bir hata oluştu.";
    return { kind: "error", message };
  }
}
