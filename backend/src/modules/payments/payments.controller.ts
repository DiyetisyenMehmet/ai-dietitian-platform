/**
 * HTTP controllers for the subscription/payments module (Sprint 15).
 */

import type { Request, Response } from "express";

import type { AuditContext } from "../../lib/audit";
import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import type { CancelSubscriptionInput, CheckoutInput, VerifyPaymentInput } from "./dto/payments.schemas";
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

/** Extracts the iyzico webhook signature header (version-tolerant). */
function signatureHeader(req: Request): string | undefined {
  const v =
    req.headers["x-iyz-signature-v3"] ??
    req.headers["x-iyz-signature"] ??
    req.headers["x-iyzico-signature"];
  return Array.isArray(v) ? v[0] : v;
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
   * request bytes, then processes idempotently. Always acknowledges with 200 so
   * the provider does not enter a retry storm; `processed` reflects whether a
   * state change actually occurred.
   */
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const rawBody = req.rawBody?.toString("utf8") ?? JSON.stringify(req.body ?? {});
    const result = await paymentsService.handleWebhook(rawBody, signatureHeader(req), auditContext(req));
    sendSuccess(res, result);
  }),
};
