/**
 * Data-access layer for the subscription/payments module (Sprint 15).
 *
 * All Prisma queries live here so the service stays persistence-agnostic.
 * Multi-step, must-be-atomic mutations (activating a subscription and syncing
 * the user's tier; recording a webhook idempotently) are wrapped in
 * `$transaction`.
 */

import type {
  Payment,
  PaymentStatus,
  Prisma,
  Subscription,
  SubscriptionStatus,
  SubscriptionTier,
} from "@prisma/client";

import { prisma } from "../../lib/prisma";

/** Non-terminal subscription statuses that represent a "current" subscription. */
const LIVE_STATUSES: SubscriptionStatus[] = ["PENDING", "ACTIVE", "PAST_DUE"];

export const paymentsRepository = {
  /** The user's most recent subscription (any status), or null. */
  findLatestSubscription(userId: string): Promise<Subscription | null> {
    return prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  /** The user's current live (ACTIVE/PENDING/PAST_DUE) subscription, or null. */
  findActiveSubscription(userId: string): Promise<Subscription | null> {
    return prisma.subscription.findFirst({
      where: { userId, status: { in: LIVE_STATUSES } },
      orderBy: { createdAt: "desc" },
    });
  },

  findSubscriptionById(id: string): Promise<Subscription | null> {
    return prisma.subscription.findUnique({ where: { id } });
  },

  /** Finds a subscription by its provider correlation reference. */
  findSubscriptionByProviderRef(providerRef: string): Promise<Subscription | null> {
    return prisma.subscription.findFirst({ where: { providerRef } });
  },

  /** Creates a PENDING subscription plus its PENDING payment atomically. */
  async createPendingSubscription(input: {
    userId: string;
    tier: SubscriptionTier;
    providerRef: string;
    amountMinor: number;
    currency: string;
  }): Promise<{ subscription: Subscription; payment: Payment }> {
    return prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          userId: input.userId,
          tier: input.tier,
          status: "PENDING",
          provider: "IYZICO",
          providerRef: input.providerRef,
        },
      });
      const payment = await tx.payment.create({
        data: {
          userId: input.userId,
          subscriptionId: subscription.id,
          provider: "IYZICO",
          status: "PENDING",
          amountMinor: input.amountMinor,
          currency: input.currency,
          providerConversationId: input.providerRef,
        },
      });
      return { subscription, payment };
    });
  },

  /**
   * Activates a subscription and syncs the owning user's tier in one
   * transaction, and marks the associated pending payment succeeded. Idempotent
   * at the call site (service checks status first).
   */
  async activateSubscription(input: {
    subscriptionId: string;
    userId: string;
    tier: SubscriptionTier;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    providerPaymentId: string | null;
    rawStatus: string | null;
  }): Promise<Subscription> {
    return prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.update({
        where: { id: input.subscriptionId },
        data: {
          status: "ACTIVE",
          currentPeriodStart: input.currentPeriodStart,
          currentPeriodEnd: input.currentPeriodEnd,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      });
      await tx.user.update({
        where: { id: input.userId },
        data: { subscriptionTier: input.tier },
      });
      await tx.payment.updateMany({
        where: { subscriptionId: input.subscriptionId, status: "PENDING" },
        data: {
          status: "SUCCEEDED",
          providerPaymentId: input.providerPaymentId,
          rawStatus: input.rawStatus,
        },
      });
      return subscription;
    });
  },

  /** Marks a subscription's pending payment failed and the subscription PAST_DUE. */
  async markPaymentFailed(input: {
    subscriptionId: string;
    rawStatus: string | null;
    failureReason: string | null;
  }): Promise<void> {
    await prisma.$transaction([
      prisma.payment.updateMany({
        where: { subscriptionId: input.subscriptionId, status: "PENDING" },
        data: {
          status: "FAILED",
          rawStatus: input.rawStatus,
          failureReason: input.failureReason,
        },
      }),
      prisma.subscription.update({
        where: { id: input.subscriptionId },
        data: { status: "PAST_DUE" },
      }),
    ]);
  },

  /**
   * Cancels a subscription. When `atPeriodEnd` the tier/entitlement is retained
   * until `currentPeriodEnd`; otherwise the user is downgraded to FREE now.
   */
  async cancelSubscription(input: {
    subscriptionId: string;
    userId: string;
    atPeriodEnd: boolean;
  }): Promise<Subscription> {
    return prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.update({
        where: { id: input.subscriptionId },
        data: {
          status: input.atPeriodEnd ? "ACTIVE" : "CANCELED",
          cancelAtPeriodEnd: input.atPeriodEnd,
          canceledAt: new Date(),
        },
      });
      if (!input.atPeriodEnd) {
        await tx.user.update({
          where: { id: input.userId },
          data: { subscriptionTier: "FREE" },
        });
      }
      return subscription;
    });
  },

  listPayments(userId: string, take = 50): Promise<Payment[]> {
    return prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    });
  },

  updatePaymentStatus(id: string, status: PaymentStatus, rawStatus: string | null): Promise<Payment> {
    return prisma.payment.update({ where: { id }, data: { status, rawStatus } });
  },

  // --- Webhook idempotency -------------------------------------------------

  /**
   * Records an inbound webhook event, returning `false` when the event id was
   * already seen (idempotent no-op). Uses the UNIQUE `providerEventId` so a
   * replayed delivery cannot double-apply a state change.
   */
  async recordWebhookEventIfNew(input: {
    providerEventId: string;
    eventType: string;
    signatureValid: boolean;
    payload: Prisma.InputJsonValue;
  }): Promise<boolean> {
    try {
      await prisma.paymentWebhookEvent.create({
        data: {
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          signatureValid: input.signatureValid,
          payload: input.payload,
        },
      });
      return true;
    } catch (error) {
      // Unique-constraint violation => already processed (idempotent replay).
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return false;
      }
      throw error;
    }
  },

  /** Stamps a webhook event as fully processed. */
  async markWebhookProcessed(providerEventId: string): Promise<void> {
    await prisma.paymentWebhookEvent.updateMany({
      where: { providerEventId },
      data: { processedAt: new Date() },
    });
  },
};
