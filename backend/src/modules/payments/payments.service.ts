/**
 * Subscription & payments service.
 *
 * Orchestrates the dormant web/iyzico checkout path while exposing one unified
 * entitlement view across Google Play and legacy web purchases.
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
  PURCHASE_TERMS_VERSION,
} from "./constants";
import type { CheckoutInput } from "./dto/payments.schemas";
import { entitlementsForTier } from "./entitlements";
import { googlePlayEntitlementsService } from "./google-play-entitlements.service";
import { getPaymentProvider } from "./iyzico";
import { paymentsRepository } from "./payments.repository";
import { resolveEffectiveSubscriptionTier } from "./subscription-state";
import type { ProviderPaymentResult } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SubscriptionStatusView {
  tier: SubscriptionTier;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  entitlements: string[];
  provider: "GOOGLE_PLAY" | "IYZICO" | null;
}

export const paymentsService = {
  /** Returns the public plan catalog. Web prices are legacy display data only. */
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
      purchaseTermsVersion: PURCHASE_TERMS_VERSION,
    }));
  },

  /** Current paid-through entitlement snapshot, regardless of purchase channel. */
  async getStatus(userId: string): Promise<SubscriptionStatusView> {
    const tier = (await resolveEffectiveSubscriptionTier(userId)) ?? "FREE";

    if (tier !== "FREE") {
      const play = await googlePlayEntitlementsService.findActiveForUser(userId);
      if (play) {
        return {
          tier: play.tier,
          status: "ACTIVE",
          currentPeriodEnd: play.expiresAt,
          cancelAtPeriodEnd: false,
          entitlements: entitlementsForTier(play.tier),
          provider: "GOOGLE_PLAY",
        };
      }
    }

    const subscription =
      tier === "FREE"
        ? await paymentsRepository.findPendingSubscription(userId)
        : await paymentsRepository.findEntitlingSubscription(userId, tier);

    return {
      tier,
      status: subscription?.status ?? "NONE",
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      entitlements: entitlementsForTier(tier),
      provider: subscription ? "IYZICO" : null,
    };
  },

  /**
   * Starts the legacy hosted checkout for a paid tier. The launch UI does not
   * call this path; it remains fail-closed for future web-commerce activation.
   */
  async initiateCheckout(
    userId: string,
    tier: SubscriptionTier,
    purchaseAcceptance: CheckoutInput["purchaseAcceptance"],
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

    // The current profile does not yet collect iyzico's required real billing
    // identity/address fields. Never let production receive test placeholders.
    if (env.IYZICO_ENV === "production") {
      throw new ApiError(503, "Live payment checkout is not ready yet.", {
        code: PAYMENT_PROVIDER_UNCONFIGURED_CODE,
        details: { reason: "LIVE_BUYER_PROFILE_REQUIRED" },
      });
    }

    if (
      purchaseAcceptance.termsVersion !== PURCHASE_TERMS_VERSION ||
      !purchaseAcceptance.distanceSalesAccepted ||
      !purchaseAcceptance.deliveryRefundAccepted ||
      !purchaseAcceptance.immediateDigitalPerformanceRequested
    ) {
      throw ApiError.badRequest("Current purchase disclosures must be accepted before checkout.");
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

    let result;
    try {
      result = await provider.initializeCheckout({
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
    } catch (error) {
      await paymentsRepository.markCheckoutInitializationFailed({
        subscriptionId: subscription.id,
        failureReason: "Payment provider checkout initialization failed.",
      });
      logger.error(
        { err: error, userId, tier, subscriptionId: subscription.id },
        "Payment checkout initialization failed",
      );
      throw new ApiError(502, "Payment checkout could not be initialized. Please try again later.");
    }

    if (!result.providerToken) {
      await paymentsRepository.markCheckoutInitializationFailed({
        subscriptionId: subscription.id,
        failureReason: "Payment provider returned no checkout token.",
      });
      throw new ApiError(502, "Payment provider returned an invalid checkout response.");
    }

    await recordAudit({
      action: "SUBSCRIPTION_CHECKOUT_STARTED",
      userId,
      context,
      metadata: {
        tier,
        subscriptionId: subscription.id,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        periodDays: plan.periodDays,
        purchaseTermsVersion: purchaseAcceptance.termsVersion,
        distanceSalesAccepted: true,
        deliveryRefundAccepted: true,
        immediateDigitalPerformanceRequested: true,
      },
    });

    return {
      subscriptionId: subscription.id,
      providerToken: result.providerToken,
      paymentPageUrl: result.paymentPageUrl,
      checkoutFormContent: result.checkoutFormContent,
    };
  },

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

    await this.applyPaymentOutcome(
      subscription.id,
      subscription.userId,
      subscription.tier,
      result,
      context,
    );
    return this.getStatus(userId);
  },

  async finalizeCheckoutCallback(
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
    if (!subscription) throw ApiError.notFound("Subscription not found.");

    await this.applyPaymentOutcome(
      subscription.id,
      subscription.userId,
      subscription.tier,
      result,
      context,
    );
    return this.getStatus(subscription.userId);
  },

  async applyPaymentOutcome(
    subscriptionId: string,
    userId: string,
    tier: SubscriptionTier,
    result: ProviderPaymentResult,
    context: AuditContext,
  ): Promise<void> {
    const current = await paymentsRepository.findSubscriptionById(subscriptionId);
    if (!current) throw ApiError.notFound("Subscription not found.");
    if (current.status === "ACTIVE") return;

    if (result.status === "SUCCEEDED") {
      const expectedPayment = await paymentsRepository.findPaymentForSubscription(subscriptionId);
      const amountMatches =
        expectedPayment !== null &&
        result.paidPriceMinor !== null &&
        result.paidPriceMinor !== undefined &&
        result.paidPriceMinor === expectedPayment.amountMinor;
      const currencyMatches =
        expectedPayment !== null &&
        typeof result.currency === "string" &&
        result.currency.toUpperCase() === expectedPayment.currency.toUpperCase();

      if (!amountMatches || !currencyMatches) {
        logger.error(
          {
            subscriptionId,
            userId,
            expectedAmountMinor: expectedPayment?.amountMinor ?? null,
            receivedAmountMinor: result.paidPriceMinor ?? null,
            expectedCurrency: expectedPayment?.currency ?? null,
            receivedCurrency: result.currency ?? null,
          },
          "Rejected successful payment with amount/currency mismatch",
        );
        await paymentsRepository.markPaymentFailed({
          subscriptionId,
          rawStatus: result.rawStatus,
          failureReason: "Payment amount/currency verification failed.",
        });
        await recordAudit({
          action: "PAYMENT_FAILED",
          userId,
          context,
          metadata: { subscriptionId, reason: "AMOUNT_OR_CURRENCY_MISMATCH" },
        });
        throw new ApiError(502, "Payment verification failed.");
      }

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
      await recordAudit({
        action: "PAYMENT_SUCCEEDED",
        userId,
        context,
        metadata: { subscriptionId },
      });
      await recordAudit({
        action: "SUBSCRIPTION_ACTIVATED",
        userId,
        context,
        metadata: { subscriptionId, tier },
      });
    } else if (result.status === "FAILED") {
      await paymentsRepository.markPaymentFailed({
        subscriptionId,
        rawStatus: result.rawStatus,
        failureReason: result.failureReason ?? null,
      });
      await recordAudit({
        action: "PAYMENT_FAILED",
        userId,
        context,
        metadata: { subscriptionId },
      });
    }
  },

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

    if (!signatureValid) {
      await recordAudit({
        action: "PAYMENT_WEBHOOK_RECEIVED",
        context,
        metadata: { eventType: event.eventType, signatureValid: false },
      });
      logger.warn({ eventType: event.eventType }, "Rejected webhook with invalid signature");
      return { received: true, processed: false };
    }

    const isNew = await paymentsRepository.recordWebhookEventIfNew({
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      signatureValid: true,
      payload: (payload ?? {}) as object,
    });
    await recordAudit({
      action: "PAYMENT_WEBHOOK_RECEIVED",
      context,
      metadata: { eventType: event.eventType, signatureValid: true, duplicate: !isNew },
    });

    if (!isNew) return { received: true, processed: false };
    if (!event.conversationId || !event.providerPaymentToken) {
      return { received: true, processed: false };
    }

    const subscription = await paymentsRepository.findSubscriptionByProviderRef(event.conversationId);
    if (!subscription) return { received: true, processed: false };

    const result = await provider.retrievePayment(event.providerPaymentToken);
    await this.applyPaymentOutcome(
      subscription.id,
      subscription.userId,
      subscription.tier,
      result,
      context,
    );
    await paymentsRepository.markWebhookProcessed(event.providerEventId);
    return { received: true, processed: true };
  },

  async cancelSubscription(
    userId: string,
    atPeriodEnd: boolean,
    context: AuditContext,
  ): Promise<SubscriptionStatusView> {
    const play = await googlePlayEntitlementsService.findActiveForUser(userId);
    if (play) {
      throw new ApiError(409, "Google Play subscriptions must be managed in Google Play.", {
        code: "STORE_MANAGED_SUBSCRIPTION",
        details: { provider: "GOOGLE_PLAY" },
      });
    }

    const tier = (await resolveEffectiveSubscriptionTier(userId)) ?? "FREE";
    const subscription =
      tier === "FREE" ? null : await paymentsRepository.findEntitlingSubscription(userId, tier);
    if (!subscription) {
      throw new ApiError(404, "No active subscription to cancel.", {
        code: ENTITLEMENT_REQUIRED_CODE,
      });
    }
    await paymentsRepository.cancelSubscription({
      subscriptionId: subscription.id,
      userId,
      atPeriodEnd,
    });
    await recordAudit({
      action: "SUBSCRIPTION_CANCELED",
      userId,
      context,
      metadata: { subscriptionId: subscription.id, atPeriodEnd },
    });
    return this.getStatus(userId);
  },

  listPayments(userId: string) {
    return paymentsRepository.listPayments(userId);
  },
};
