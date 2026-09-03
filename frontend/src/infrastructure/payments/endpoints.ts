/** Payment/subscription endpoint paths relative to the configured API base URL. */
export const PAYMENT_ENDPOINTS = {
  plans: "/subscription/plans",
  subscription: "/subscription",
  cancelSubscription: "/subscription/cancel",
  checkout: "/payments/checkout",
  verify: "/payments/verify",
  payments: "/payments",
  googlePlayConfig: "/payments/google-play/config",
  googlePlayVerify: "/payments/google-play/subscription/verify",
} as const;
