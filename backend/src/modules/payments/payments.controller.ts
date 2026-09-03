/**
 * HTTP controllers for the subscription/payments module.
 */

import type { Request, Response } from "express";

import { env } from "../../config/env";
import type { AuditContext } from "../../lib/audit";
import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import type {
  CancelSubscriptionInput,
  CheckoutInput,
  VerifyGooglePlaySubscriptionInput,
  VerifyPaymentInput,
} from "./dto/payments.schemas";
import { googlePlayBilling } from "./google-play";
import { paymentsService } from "./payments.service";

function auditContext(req: Request): AuditContext {
  return {
    userAgent: req.headers["user-agent"] ?? null,
    ipAddress: req.ip ?? null,
  };
}

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

function signatureHeader(req: Request): string | undefined {
  const v = req.headers["x-iyz-signature-v3"];
  return Array.isArray(v) ? v[0] : v;
}

function billingReturnUrl(status: "success" | "pending" | "failed"): string {
  const base = env.APP_WEB_URL.replace(/\/$/, "");
  return `${base}/profile/subscription?payment=${status}`;
}

export const paymentsController = {
  listPlans: asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, { plans: paymentsService.listPlans() });
  }),

  getSubscription: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    sendSuccess(res, await paymentsService.getStatus(userId));
  }),

  googlePlayConfig: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    sendSuccess(res, googlePlayBilling.clientConfig(userId));
  }),

  googlePlayVerify: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { purchaseToken } = req.body as VerifyGooglePlaySubscriptionInput;
    const verified = await googlePlayBilling.verifySubscription(purchaseToken, userId);

    // Verification is intentionally separated from entitlement persistence for
    // now. The next payment-domain migration adds a provider-neutral, unique
    // purchase-token ledger so the same Play purchase can never be claimed by
    // two Diewish accounts. Never acknowledge before that durable grant exists.
    sendSuccess(res, {
      verified: true,
      tier: verified.tier,
      productId: verified.productId,
      expiresAt: verified.expiresAt,
      acknowledgementPending: verified.acknowledgementPending,
    });
  }),

  checkout: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { tier, purchaseAcceptance } = req.body as CheckoutInput;
    const result = await paymentsService.initiateCheckout(
      userId,
      tier,
      purchaseAcceptance,
      auditContext(req),
    );
    sendSuccess(res, result, 201);
  }),

  verifyPayment: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { token } = req.body as VerifyPaymentInput;
    sendSuccess(res, await paymentsService.verifyAndFinalize(userId, token, auditContext(req)));
  }),

  checkoutCallback: asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body as VerifyPaymentInput;
    const status = await paymentsService.finalizeCheckoutCallback(token, auditContext(req));
    const outcome = status.status === "ACTIVE" ? "success" : status.status === "PENDING" ? "pending" : "failed";
    res.redirect(303, billingReturnUrl(outcome));
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { atPeriodEnd } = req.body as CancelSubscriptionInput;
    sendSuccess(res, await paymentsService.cancelSubscription(userId, atPeriodEnd, auditContext(req)));
  }),

  listPayments: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    sendSuccess(res, { payments: await paymentsService.listPayments(userId) });
  }),

  webhook: asyncHandler(async (req: Request, res: Response) => {
    const rawBody = req.rawBody?.toString("utf8") ?? JSON.stringify(req.body ?? {});
    const result = await paymentsService.handleWebhook(
      rawBody,
      signatureHeader(req),
      auditContext(req),
    );
    sendSuccess(res, result);
  }),
};