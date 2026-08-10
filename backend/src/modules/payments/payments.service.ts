/**
 * Subscription & payments service (Sprint 15, D1–D3).
 *
 * Orchestrates the hosted-checkout purchase flow, callback finalization and
 * idempotent webhook processing on top of the provider abstraction and the
 * repository. Security posture: an unverified or replayed webhook must never
 * grant paid access — signatures are verified and events are de-duplicated
 * before any state change, and payment success is always confirmed against the
 * provider (never trusted from the client).
 */

import crypto from "node:crypto";

import type { SubscriptionTier } from "@prisma/client";

import { env } from "../../config/env";
import { recordAudit, type AuditContext } from "../../lib/audit";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import {
  ENTITLEMENT_REQUIRED_CODE,
  PAYMENT_PROVIDER_UNCONFIGURED_CODE,
  PLAN_CATALOG,
} from "./constants";
import { entitlementsForTier } from "./entitlements";
import { getPaymentProvider } from "./iyzico";
import { paymentsRepository } from "./payments.repository";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SubscriptionStatusView {
  tier: SubscriptionTier;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  entitlements: string[];
}

export const paymentsService = {
  /** Returns the public plan catalog (all tiers, prices, descriptions). */
  listPlans() {
    return Object.values(PLAN_CATALOG).map((plan) => ({
      tier: plan.tier,
      code: plan.code,
      name: plan.name,
      priceMinor: plan.priceMinor,
      price: (plan.priceMinor / 100).toFixed(2),
      currency: plan.currency,
      periodDays: plan.periodDays,
      description: plan.description,
      entitlements: entitlementsForTier(plan.tier),
    }));
  },

  /** Current subscription + entitlement snapshot for a user. */
  async getStatus(userId: string): Promise<SubscriptionStatusView> {
    const [user, subscription] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { subscriptionTier: true } }),
      paymentsRepository.findActiveSubscription(userId),
    ]);
    const tier: SubscriptionTier = user?.subscriptionTier ?? "FREE";
    return {
      tier,
      status: subscription?.status ?? "NONE",
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      entitlements: entitlementsForTier(tier),
    };
  },

  /**
   * Starts a hosted-checkout for a paid tier. Creates a PENDING subscription +
   * payment keyed by a fresh conversation id (our correlation ref), then asks
   * the provider to initialize the payment page.
   */
  async initiateCheckout(
    userId: string,
    tier: SubscriptionTier,
    context: AuditContext,
  ): Promise<{
    subscriptionId: string;
    providerToken: string;
    paymentPageUrl?: string;
    checkoutFormContent?: string;
  }> {
    const provider = getPaymentProvider();
    if (!provider.isConfigured()) {
      throw new ApiError(503, "Payment provider is not configured.", {
        code: PAYMENT_PROVIDER_UNCONFIGURED_CODE,
      });
    }

    const plan = PLAN_CATALOG[tier];
    if (plan.priceMinor <= 0) {
      throw ApiError.badRequest("Selected plan is not purchasable.");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true },
    });
    if (!user) throw ApiError.unauthorized("Session is no longer valid.");

    const conversationId = crypto.randomUUID();
    const { subscription } = await paymentsRepository.createPendingSubscription({
      userId,
      tier,
      providerRef: conversationId,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
    });

    const result = await provider.initializeCheckout({
      conversationId,
      tier,
      priceMinor: plan.priceMinor,
      currency: plan.currency,
      planName: plan.name,
      planCode: plan.code,
      buyer: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        ipAddress: context.ipAddress ?? null,
      },
      callbackUrl: env.IYZICO_CALLBACK_URL,
    });

    await recordAudit({
      action: "SUBSCRIPTION_CHECKOUT_STARTED",
      userId,
      context,
      metadata: { tier, subscriptionId: subscription.id },
    });

    return {
      subscriptionId: subscription.id,
      providerToken: result.providerToken,
      paymentPageUrl: result.paymentPageUrl,
      checkoutFormContent: result.checkoutFormContent,
    };
  },

  /**
   * Finalizes a checkout from the provider token (called after the callback
   * redirect). Payment success is confirmed against the provider — never
   * trusted from the client — then the subscription is activated idempotently.
   */
  async verifyAndFinalize(
    userId: string,
    token: string,
    context: AuditContext,
  ): Promise<SubscriptionStatusView> {
    const provider = getPaymentProvider();
    const result = await provider.retrievePayment(token);

    const conversationId = result.conversationId;
    if (!conversationId) {
      throw ApiError.badRequest("Payment could not be correlated to a subscription.");
    }
    const subscription = await paymentsRepository.findSubscriptionByProviderRef(conversationId);
    if (!subscription || subscription.userId !== userId) {
      throw ApiError.notFound("Subscription not found.");
    }

    await this.applyPaymentOutcome(subscription.id, subscription.userId, subscription.tier, result, context);
    return this.getStatus(userId);
  },

  /**
   * Applies a confirmed provider payment outcome to a subscription. Idempotent:
   * an already-ACTIVE subscription is left untouched.
   */
  async applyPaymentOutcome(
    subscriptionId: string,
    userId: string,
    tier: SubscriptionTier,
    result: { status: string; rawStatus: string; providerPaymentId?: string | null; failureReason?: string | null },
    context: AuditContext,
  ): Promise<void> {
    const current = await paymentsRepository.findSubscriptionById(subscriptionId);
    if (!current) throw ApiError.notFound("Subscription not found.");
    if (current.status === "ACTIVE") return; // idempotent no-op

    if (result.status === "SUCCEEDED") {
      const now = new Date();
      const plan = PLAN_CATALOG[tier];
      await paymentsRepository.activateSubscription({
        subscriptionId,
        userId,
        tier,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + plan.periodDays * MS_PER_DAY),
        providerPaymentId: result.providerPaymentId ?? null,
        rawStatus: result.rawStatus,
      });
      await recordAudit({ action: "PAYMENT_SUCCEEDED", userId, context, metadata: { subscriptionId } });
      await recordAudit({ action: "SUBSCRIPTION_ACTIVATED", userId, context, metadata: { subscriptionId, tier } });
    } else if (result.status === "FAILED") {
      await paymentsRepository.markPaymentFailed({
        subscriptionId,
        rawStatus: result.rawStatus,
        failureReason: result.failureReason ?? null,
      });
      await recordAudit({ action: "PAYMENT_FAILED", userId, context, metadata: { subscriptionId } });
    }
    // PENDING: leave as-is; a later webhook/verify will finalize.
  },

  /**
   * Processes an inbound provider webhook. Verifies the signature and
   * de-duplicates by event id BEFORE any state change; confirms the payment
   * against the provider rather than trusting the notification body.
   */
  async handleWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
    context: AuditContext,
  ): Promise<{ received: true; processed: boolean }> {
    const provider = getPaymentProvider();
    const signatureValid = provider.verifyWebhookSignature(rawBody, signatureHeader);

    let payload: unknown = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = {};
    }
    const event = provider.parseWebhook(payload);

    const isNew = await paymentsRepository.recordWebhookEventIfNew({
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      signatureValid,
      payload: (payload ?? {}) as object,
    });
    await recordAudit({
      action: "PAYMENT_WEBHOOK_RECEIVED",
      context,
      metadata: { eventType: event.eventType, signatureValid, duplicate: !isNew },
    });

    // Fail closed: never act on an unverified or replayed event.
    if (!signatureValid) {
      logger.warn({ eventType: event.eventType }, "Rejected webhook with invalid signature");
      return { received: true, processed: false };
    }
    if (!isNew) {
      return { received: true, processed: false };
    }
    if (!event.conversationId || !event.providerPaymentToken) {
      return { received: true, processed: false };
    }

    const subscription = await paymentsRepository.findSubscriptionByProviderRef(event.conversationId);
    if (!subscription) return { received: true, processed: false };

    // Confirm the real outcome with the provider before granting access.
    const result = await provider.retrievePayment(event.providerPaymentToken);
    await this.applyPaymentOutcome(subscription.id, subscription.userId, subscription.tier, result, context);
    await paymentsRepository.markWebhookProcessed(event.providerEventId);
    return { received: true, processed: true };
  },

  /** Cancels the user's active subscription (at period end by default). */
  async cancelSubscription(
    userId: string,
    atPeriodEnd: boolean,
    context: AuditContext,
  ): Promise<SubscriptionStatusView> {
    const subscription = await paymentsRepository.findActiveSubscription(userId);
    if (!subscription) {
      throw new ApiError(404, "No active subscription to cancel.", {
        code: ENTITLEMENT_REQUIRED_CODE,
      });
    }
    await paymentsRepository.cancelSubscription({ subscriptionId: subscription.id, userId, atPeriodEnd });
    await recordAudit({
      action: "SUBSCRIPTION_CANCELED",
      userId,
      context,
      metadata: { subscriptionId: subscription.id, atPeriodEnd },
    });
    return this.getStatus(userId);
  },

  /** Payment history for the authenticated user. */
  listPayments(userId: string) {
    return paymentsRepository.listPayments(userId);
  },
};
