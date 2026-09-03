import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { paymentsController } from "./payments.controller";
import {
  cancelSubscriptionSchema,
  checkoutSchema,
  verifyGooglePlaySubscriptionSchema,
  verifyPaymentSchema,
} from "./dto/payments.schemas";

/**
 * Subscription & payments router (Sprint 15).
 *
 * Two base paths are contributed by this module (see the manifest):
 *   /subscription — plan catalog, status, cancellation (owner-scoped)
 *   /payments     — checkout, store verification, history, and provider webhooks
 */

export const subscriptionRouter = Router();

subscriptionRouter.get("/plans", paymentsController.listPlans);
subscriptionRouter.get("/", authenticate, paymentsController.getSubscription);
subscriptionRouter.post(
  "/cancel",
  authenticate,
  validate({ body: cancelSubscriptionSchema }),
  paymentsController.cancel,
);

export const paymentsRouter = Router();

/**
 * Android Billing bootstrap. Returns only public product/package identifiers
 * plus a non-PII account binding for BillingFlowParams.obfuscatedAccountId.
 */
paymentsRouter.get(
  "/google-play/config",
  authenticate,
  paymentsController.googlePlayConfig,
);

/**
 * Server-side Google Play verification. This endpoint does NOT trust a client
 * product id; the purchased product and expiry are read from Google directly.
 */
paymentsRouter.post(
  "/google-play/subscription/verify",
  authenticate,
  validate({ body: verifyGooglePlaySubscriptionSchema }),
  paymentsController.googlePlayVerify,
);

/** Existing web/iyzico checkout remains dormant until web commerce is enabled. */
paymentsRouter.post(
  "/checkout",
  authenticate,
  validate({ body: checkoutSchema }),
  paymentsController.checkout,
);

paymentsRouter.post(
  "/callback",
  validate({ body: verifyPaymentSchema }),
  paymentsController.checkoutCallback,
);

paymentsRouter.post(
  "/verify",
  authenticate,
  validate({ body: verifyPaymentSchema }),
  paymentsController.verifyPayment,
);

paymentsRouter.get("/", authenticate, paymentsController.listPayments);

/** iyzico webhook; signature verification happens before idempotency recording. */
paymentsRouter.post("/webhook", paymentsController.webhook);