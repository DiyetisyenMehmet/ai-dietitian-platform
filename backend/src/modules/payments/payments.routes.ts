import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { paymentsController } from "./payments.controller";
import {
  cancelSubscriptionSchema,
  checkoutSchema,
  verifyPaymentSchema,
} from "./dto/payments.schemas";

/**
 * Subscription & payments router (Sprint 15).
 *
 * Two base paths are contributed by this module (see the manifest):
 *   /subscription — plan catalog, status, cancellation (owner-scoped)
 *   /payments     — checkout, callback verification, history, and the public
 *                   provider webhook (unauthenticated, signature-verified)
 */

export const subscriptionRouter = Router();

/**
 * @openapi
 * /api/subscription/plans:
 *   get:
 *     tags: [Subscription]
 *     summary: List available subscription plans and their entitlements
 *     responses:
 *       200: { description: Plan catalog. }
 */
subscriptionRouter.get("/plans", paymentsController.listPlans);

/**
 * @openapi
 * /api/subscription:
 *   get:
 *     tags: [Subscription]
 *     summary: Get the authenticated user's subscription status and entitlements
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Subscription status. }
 *       401: { description: Not authenticated. }
 */
subscriptionRouter.get("/", authenticate, paymentsController.getSubscription);

/**
 * @openapi
 * /api/subscription/cancel:
 *   post:
 *     tags: [Subscription]
 *     summary: Cancel the active subscription (at period end by default)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Subscription canceled. }
 *       404: { description: No active subscription. }
 */
subscriptionRouter.post(
  "/cancel",
  authenticate,
  validate({ body: cancelSubscriptionSchema }),
  paymentsController.cancel,
);

export const paymentsRouter = Router();

/**
 * @openapi
 * /api/payments/checkout:
 *   post:
 *     tags: [Payments]
 *     summary: Start a hosted checkout for a paid plan
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Checkout initialized; returns token/payment page URL. }
 *       503: { description: Payment provider not configured. }
 */
paymentsRouter.post(
  "/checkout",
  authenticate,
  validate({ body: checkoutSchema }),
  paymentsController.checkout,
);

/**
 * @openapi
 * /api/payments/verify:
 *   post:
 *     tags: [Payments]
 *     summary: Finalize a checkout from the provider token (callback handling)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Payment verified; subscription updated. }
 */
paymentsRouter.post(
  "/verify",
  authenticate,
  validate({ body: verifyPaymentSchema }),
  paymentsController.verifyPayment,
);

/**
 * @openapi
 * /api/payments:
 *   get:
 *     tags: [Payments]
 *     summary: List the authenticated user's payment history
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Payment history. }
 */
paymentsRouter.get("/", authenticate, paymentsController.listPayments);

/**
 * @openapi
 * /api/payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Provider payment webhook (signature-verified, idempotent)
 *     responses:
 *       200: { description: Acknowledged. }
 */
paymentsRouter.post("/webhook", paymentsController.webhook);
