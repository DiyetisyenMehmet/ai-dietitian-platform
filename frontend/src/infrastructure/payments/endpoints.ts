/**
 * Payment/subscription endpoint paths (relative to NEXT_PUBLIC_API_BASE_URL).
 * These match the backend REST contract delivered in Sprint 15.
 */
export const PAYMENT_ENDPOINTS = {
  /** Public plan catalog. */
  plans: "/subscription/plans",
  /** Current subscription status (authenticated). */
  subscription: "/subscription",
  /** Initiate a hosted checkout for a paid tier (authenticated). */
  checkout: "/payments/checkout",
} as const;
