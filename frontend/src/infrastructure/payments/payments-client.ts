import { apiRequest } from "@/infrastructure/api/http-client";
import type {
  CheckoutResult,
  PaidTier,
  PaymentDto,
  PlanDto,
  PurchaseAcceptance,
  SubscriptionStatusDto,
} from "@/domain/payments/types";
import { PAYMENT_ENDPOINTS } from "./endpoints";

/** Thin transport client for the real backend subscription/payments contract. */
export const paymentsClient = {
  listPlans(): Promise<{ plans: PlanDto[] }> {
    return apiRequest<{ plans: PlanDto[] }>({
      path: PAYMENT_ENDPOINTS.plans,
      method: "GET",
    });
  },

  getSubscription(): Promise<SubscriptionStatusDto> {
    return apiRequest<SubscriptionStatusDto>({
      path: PAYMENT_ENDPOINTS.subscription,
      method: "GET",
      auth: true,
    });
  },

  listPayments(): Promise<{ payments: PaymentDto[] }> {
    return apiRequest<{ payments: PaymentDto[] }>({
      path: PAYMENT_ENDPOINTS.payments,
      method: "GET",
      auth: true,
    });
  },

  startCheckout(tier: PaidTier, purchaseAcceptance: PurchaseAcceptance): Promise<CheckoutResult> {
    return apiRequest<CheckoutResult>({
      path: PAYMENT_ENDPOINTS.checkout,
      method: "POST",
      auth: true,
      body: JSON.stringify({ tier, purchaseAcceptance }),
    });
  },

  verifyPayment(token: string): Promise<SubscriptionStatusDto> {
    return apiRequest<SubscriptionStatusDto>({
      path: PAYMENT_ENDPOINTS.verify,
      method: "POST",
      auth: true,
      body: JSON.stringify({ token }),
    });
  },

  cancelSubscription(atPeriodEnd = true): Promise<SubscriptionStatusDto> {
    return apiRequest<SubscriptionStatusDto>({
      path: PAYMENT_ENDPOINTS.cancelSubscription,
      method: "POST",
      auth: true,
      body: JSON.stringify({ atPeriodEnd }),
    });
  },
} as const;
