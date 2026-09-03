import type { SubscriptionTier } from "@prisma/client";

import { recordAudit, type AuditContext } from "../../lib/audit";
import { logger } from "../../lib/logger";
import { googlePlayBilling } from "./google-play";
import {
  googlePlayEntitlementsRepository,
  type GooglePlayEntitlementRow,
} from "./google-play-entitlements.repository";

export interface GooglePlayEntitlementResult {
  verified: true;
  tier: SubscriptionTier;
  productId: string;
  expiresAt: Date;
  acknowledgementPending: boolean;
}

/**
 * Secure server-side Google Play purchase finalization.
 *
 * Order is deliberate:
 * 1) verify the token directly with Google;
 * 2) durably/idempotently bind the token hash to this Diewish account;
 * 3) only then acknowledge the Play purchase.
 *
 * This prevents a client from granting itself Premium and prevents the same
 * purchase token being replayed across multiple Diewish accounts.
 */
export const googlePlayEntitlementsService = {
  async verifyGrantAndAcknowledge(
    userId: string,
    purchaseToken: string,
    context: AuditContext,
  ): Promise<GooglePlayEntitlementResult> {
    const verified = await googlePlayBilling.verifySubscription(purchaseToken, userId);
    const purchaseTokenHash = googlePlayEntitlementsRepository.hashPurchaseToken(purchaseToken);
    const linkedPurchaseTokenHash = verified.linkedPurchaseToken
      ? googlePlayEntitlementsRepository.hashPurchaseToken(verified.linkedPurchaseToken)
      : null;

    const previous = await googlePlayEntitlementsRepository.findByTokenHash(purchaseTokenHash);
    const entitlement = await googlePlayEntitlementsRepository.grantVerified({
      userId,
      purchaseTokenHash,
      linkedPurchaseTokenHash,
      productId: verified.productId,
      tier: verified.tier,
      orderId: verified.orderId,
      rawState: verified.rawState,
      startedAt: verified.startedAt,
      expiresAt: verified.expiresAt,
    });

    if (!previous) {
      await recordAudit({
        action: "SUBSCRIPTION_ACTIVATED",
        userId,
        context,
        metadata: {
          provider: "GOOGLE_PLAY",
          entitlementId: entitlement.id,
          productId: entitlement.productId,
          tier: entitlement.tier,
          expiresAt: entitlement.expiresAt.toISOString(),
        },
      });
    }

    let acknowledgementPending = verified.acknowledgementPending;
    if (verified.acknowledgementPending) {
      try {
        await googlePlayBilling.acknowledgeSubscription(verified.productId, purchaseToken);
        await googlePlayEntitlementsRepository.markAcknowledged(userId, purchaseTokenHash);
        acknowledgementPending = false;
      } catch (error) {
        // The paid entitlement is already durably recorded. Never tell a charged
        // user their purchase failed solely because Google's acknowledge call was
        // transiently unavailable; restore/verification retries acknowledgement.
        logger.error(
          {
            err: error,
            userId,
            entitlementId: entitlement.id,
            productId: entitlement.productId,
          },
          "Google Play acknowledgement failed after durable entitlement grant",
        );
      }
    } else if (!entitlement.acknowledgedAt) {
      // Google already reports acknowledged (for example after a retry). Mirror
      // that fact locally without another provider call.
      await googlePlayEntitlementsRepository.markAcknowledged(userId, purchaseTokenHash);
    }

    const effective = await googlePlayEntitlementsRepository.findBestActiveForUser(userId);
    return {
      verified: true,
      tier: effective?.tier ?? entitlement.tier,
      productId: entitlement.productId,
      expiresAt: effective?.expiresAt ?? entitlement.expiresAt,
      acknowledgementPending,
    };
  },

  findActiveForUser(userId: string): Promise<GooglePlayEntitlementRow | null> {
    return googlePlayEntitlementsRepository.findBestActiveForUser(userId);
  },
};
