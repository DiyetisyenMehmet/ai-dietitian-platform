"use client";

import { authStore } from "@/application/auth/auth-store";
import { ApiError } from "@/infrastructure/api/http-client";
import { paymentsClient } from "@/infrastructure/payments/payments-client";
import type { PaidTier, PurchaseAcceptance } from "@/domain/payments/types";

export type CheckoutOutcome =
  | { kind: "auth-required"; redirectTo: string }
  | { kind: "redirect"; url: string }
  | { kind: "error"; message: string };

/** Starts hosted checkout only after explicit purchase disclosures are accepted. */
export async function beginCheckout(
  tier: PaidTier,
  purchaseAcceptance: PurchaseAcceptance,
): Promise<CheckoutOutcome> {
  const { status } = authStore.getSnapshot();

  if (status !== "authenticated") {
    return { kind: "auth-required", redirectTo: `/register?plan=${tier}` };
  }

  try {
    const result = await paymentsClient.startCheckout(tier, purchaseAcceptance);

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
