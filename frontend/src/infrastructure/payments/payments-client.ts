import { apiRequest } from "@/infrastructure/api/http-client";
import type { CheckoutResult, PaidTier, PlanDto } from "@/domain/payments/types";
import { PAYMENT_ENDPOINTS } from "./endpoints";

/**
 * Transport-layer client for the payments/subscription API. Thin wrappers over
 * the shared HTTP client; all business decisions live in the application layer.
 */
export const paymentsClient = {
  /** Fetches the public plan catalog. No authentication required. */
  listPlans(): Promise<{ plans: PlanDto[] }> {
    return apiRequest<{ plans: PlanDto[] }>({
      path: PAYMENT_ENDPOINTS.plans,
      method: "GET",
    });
  },

  /**
   * Initiates a hosted iyzico checkout for a paid tier. Requires an
   * authenticated session (bearer token attached automatically).
   */
  startCheckout(tier: PaidTier): Promise<CheckoutResult> {
    return apiRequest<CheckoutResult>({
      path: PAYMENT_ENDPOINTS.checkout,
      method: "POST",
      auth: true,
      body: JSON.stringify({ tier }),
    });
  },
} as const;
