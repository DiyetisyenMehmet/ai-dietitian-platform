/**
 * HTTP controllers for the subscription/payments module (Sprint 15).
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
  VerifyPaymentInput,
} from "./dto/payments.schemas";
import { paymentsService } from "./payments.service";

/** Derives best-effort request context for audit records. */
function auditContext(req: Request): AuditContext {
  return {
    userAgent: req.headers["user-agent"] ?? null,
    ipAddress: req.ip ?? null,
  };
}

/** Returns the authenticated user id or throws a 401. */
function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

/** Extracts the currently supported iyzico webhook signature header. */
function signatureHeader(req: Request): string | undefined {
  const v = req.headers["x-iyz-signature-v3"];
  return Array.isArray(v) ? v[0] : v;
}

/** Builds a fixed frontend destination after a provider callback. */
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

  checkout: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { tier } = req.body as CheckoutInput;
    const result = await paymentsService.initiateCheckout(userId, tier, auditContext(req));
    sendSuccess(res, result, 201);
  }),

  verifyPayment: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { token } = req.body as VerifyPaymentInput;
    sendSuccess(res, await paymentsService.verifyAndFinalize(userId, token, auditContext(req)));
  }),

  /**
   * Public browser callback used directly by iyzico Checkout Form. The posted
   * token is verified server-to-server and correlated to our pending payment;
   * no Diewish bearer token is trusted or required for this provider callback.
   */
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

  /**
   * Public webhook endpoint. Verifies the provider signature against the raw
   * request bytes, then processes idempotently. Invalid or duplicate deliveries
   * are acknowledged without changing paid access.
   */
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
