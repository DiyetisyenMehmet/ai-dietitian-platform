import type {
  AdminSupportEntitlement,
  Subscription,
  SubscriptionStatus,
  SubscriptionTier,
} from "@prisma/client";

import { ApiError } from "../../utils/api-error";
import { entitlementsForTier } from "../payments/entitlements";
import {
  googlePlayEntitlementsRepository,
  type GooglePlayEntitlementRow,
} from "../payments/google-play-entitlements.repository";
import { paymentsRepository } from "../payments/payments.repository";
import { readEffectiveSubscriptionState } from "../payments/subscription-state";
import {
  findSupportEntitlementForUser,
  supportEntitlementStatus,
} from "../payments/support-entitlements.repository";

export type AdminSubscriptionRecordStatus = SubscriptionStatus | "REVOKED";
export type AdminSupportEntitlementStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface AdminSubscriptionRecordView {
  status: AdminSubscriptionRecordStatus;
  provider: "GOOGLE_PLAY" | "IYZICO";
  source: "GOOGLE_PLAY_ENTITLEMENT" | "IYZICO_SUBSCRIPTION";
  startDate: Date | null;
  expiryOrRenewalDate: Date | null;
  cancelAtPeriodEnd: boolean | null;
  canceledAt: Date | null;
  trial: null;
}

export interface AdminSupportEntitlementView {
  id: string;
  tier: SubscriptionTier;
  status: AdminSupportEntitlementStatus;
  grantedAt: Date;
  expiresAt: Date | null;
  updatedAt: Date;
}

export interface AdminUserSubscriptionView {
  currentPlan: SubscriptionTier;
  providerPlan: SubscriptionTier;
  currentPlanSource:
    | "GOOGLE_PLAY_ENTITLEMENT"
    | "IYZICO_SUBSCRIPTION"
    | "ADMIN_SUPPORT"
    | "ACCOUNT_DEFAULT";
  entitlementStatus: "ACTIVE" | "FREE";
  entitlements: string[];
  record: AdminSubscriptionRecordView | null;
  supportEntitlement: AdminSupportEntitlementView | null;
}

function legacyStatus(row: Subscription, now: Date): AdminSubscriptionRecordStatus {
  if (
    row.status === "ACTIVE" &&
    (!row.currentPeriodEnd || row.currentPeriodEnd.getTime() <= now.getTime())
  ) {
    return "EXPIRED";
  }
  return row.status;
}

function legacyRecord(row: Subscription, now: Date): AdminSubscriptionRecordView {
  return {
    status: legacyStatus(row, now),
    provider: "IYZICO",
    source: "IYZICO_SUBSCRIPTION",
    startDate: row.currentPeriodStart,
    expiryOrRenewalDate: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    canceledAt: row.canceledAt,
    trial: null,
  };
}

function playRecord(
  row: GooglePlayEntitlementRow,
  now: Date,
): AdminSubscriptionRecordView {
  const status: AdminSubscriptionRecordStatus = row.revokedAt
    ? "REVOKED"
    : row.expiresAt.getTime() <= now.getTime()
      ? "EXPIRED"
      : "ACTIVE";
  return {
    status,
    provider: "GOOGLE_PLAY",
    source: "GOOGLE_PLAY_ENTITLEMENT",
    startDate: row.startedAt,
    expiryOrRenewalDate: row.expiresAt,
    cancelAtPeriodEnd: null,
    canceledAt: null,
    trial: null,
  };
}

function supportRecord(
  row: AdminSupportEntitlement | null,
  now: Date,
): AdminSupportEntitlementView | null {
  if (!row) return null;
  return {
    id: row.id,
    tier: row.tier,
    status: supportEntitlementStatus(row, now),
    grantedAt: row.grantedAt,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  };
}

function newerRecord(
  legacy: Subscription | null,
  play: GooglePlayEntitlementRow | null,
): "IYZICO" | "GOOGLE_PLAY" | null {
  if (!legacy && !play) return null;
  if (!legacy) return "GOOGLE_PLAY";
  if (!play) return "IYZICO";
  return play.updatedAt.getTime() > legacy.updatedAt.getTime() ? "GOOGLE_PLAY" : "IYZICO";
}

export const adminUserSubscriptionService = {
  async detail(userId: string): Promise<{ subscription: AdminUserSubscriptionView }> {
    const effective = await readEffectiveSubscriptionState(userId);
    if (!effective) throw ApiError.notFound("User not found.");

    const now = new Date();
    let record: AdminSubscriptionRecordView | null = null;

    if (effective.googlePlay) {
      record = playRecord(effective.googlePlay, now);
    } else if (effective.subscription) {
      record = legacyRecord(effective.subscription, now);
    } else {
      const [latestLegacy, latestPlay] = await Promise.all([
        paymentsRepository.findLatestSubscription(userId),
        googlePlayEntitlementsRepository.findLatestForUser(userId),
      ]);
      const latest = newerRecord(latestLegacy, latestPlay);
      if (latest === "IYZICO" && latestLegacy) record = legacyRecord(latestLegacy, now);
      if (latest === "GOOGLE_PLAY" && latestPlay) record = playRecord(latestPlay, now);
    }

    const support = await findSupportEntitlementForUser(userId);
    const currentPlanSource =
      effective.source === "GOOGLE_PLAY"
        ? "GOOGLE_PLAY_ENTITLEMENT"
        : effective.source === "IYZICO"
          ? "IYZICO_SUBSCRIPTION"
          : effective.source === "ADMIN_SUPPORT"
            ? "ADMIN_SUPPORT"
            : "ACCOUNT_DEFAULT";

    return {
      subscription: {
        currentPlan: effective.tier,
        providerPlan: effective.providerTier,
        currentPlanSource,
        entitlementStatus: effective.tier === "FREE" ? "FREE" : "ACTIVE",
        entitlements: entitlementsForTier(effective.tier),
        record,
        supportEntitlement: supportRecord(support, now),
      },
    };
  },
};
