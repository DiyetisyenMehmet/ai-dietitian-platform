import crypto from "node:crypto";

import type { SubscriptionTier } from "@prisma/client";

import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const ANDROID_PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const CLOCK_SKEW_SECONDS = 30;

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface GoogleSubscriptionLineItem {
  productId?: string;
  expiryTime?: string;
}

interface GoogleSubscriptionPurchaseV2 {
  subscriptionState?: string;
  acknowledgementState?: string;
  latestOrderId?: string;
  startTime?: string;
  linkedPurchaseToken?: string;
  externalAccountIdentifiers?: {
    obfuscatedExternalAccountId?: string;
    obfuscatedExternalProfileId?: string;
  };
  lineItems?: GoogleSubscriptionLineItem[];
}

export interface VerifiedGooglePlaySubscription {
  tier: SubscriptionTier;
  productId: string;
  purchaseToken: string;
  linkedPurchaseToken: string | null;
  startedAt: Date | null;
  expiresAt: Date;
  acknowledgementPending: boolean;
  orderId: string | null;
  obfuscatedAccountId: string | null;
  rawState: "SUBSCRIPTION_STATE_ACTIVE";
}

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function privateKey(): string {
  return (env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
}

function isConfigured(): boolean {
  return Boolean(
    env.GOOGLE_PLAY_PACKAGE_NAME &&
      env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL &&
      env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY &&
      env.GOOGLE_PLAY_PREMIUM_PRODUCT_ID &&
      env.GOOGLE_PLAY_PREMIUM_PLUS_PRODUCT_ID,
  );
}

function tierForProduct(productId: string): SubscriptionTier | null {
  if (productId === env.GOOGLE_PLAY_PREMIUM_PRODUCT_ID) return "PREMIUM";
  if (productId === env.GOOGLE_PLAY_PREMIUM_PLUS_PRODUCT_ID) return "PREMIUM_PLUS";
  return null;
}

/**
 * Stable, non-PII account binding passed to BillingFlowParams as
 * obfuscatedAccountId. Google returns the same value during server-side
 * verification, allowing Diewish to reject a purchase token presented by a
 * different account without exposing email/name to Google Play Billing.
 */
function obfuscatedAccountId(userId: string): string {
  return crypto.createHash("sha256").update(`diewish:play:${userId}`).digest("hex");
}

async function accessToken(): Promise<string> {
  if (!isConfigured()) {
    throw new ApiError(503, "Google Play billing verification is not configured.", {
      code: "GOOGLE_PLAY_UNCONFIGURED",
    });
  }

  const nowMs = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > nowMs + 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(nowMs / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL,
      scope: PUBLISHER_SCOPE,
      aud: TOKEN_URL,
      iat: now - CLOCK_SKEW_SECONDS,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey());
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth2:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new ApiError(502, "Google Play authorization failed.");
  }

  const payload = (await response.json()) as GoogleTokenResponse;
  if (!payload.access_token) {
    throw new ApiError(502, "Google Play returned an invalid authorization response.");
  }

  cachedAccessToken = {
    token: payload.access_token,
    expiresAtMs: nowMs + Math.max(60, payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}

export const googlePlayBilling = {
  isConfigured,
  obfuscatedAccountId,

  clientConfig(userId: string) {
    return {
      packageName: env.GOOGLE_PLAY_PACKAGE_NAME,
      premiumProductId: env.GOOGLE_PLAY_PREMIUM_PRODUCT_ID,
      premiumPlusProductId: env.GOOGLE_PLAY_PREMIUM_PLUS_PRODUCT_ID,
      obfuscatedAccountId: obfuscatedAccountId(userId),
      serverVerificationReady: isConfigured(),
    };
  },

  /**
   * Verifies an initial/active subscription directly with Google Play. The
   * client-sent product id is never trusted: the tier and paid-through time are
   * derived from Google's Purchases.subscriptionsv2 response. Pending, paused,
   * expired and canceled states never grant a new Diewish entitlement here.
   */
  async verifySubscription(
    purchaseToken: string,
    expectedUserId?: string,
  ): Promise<VerifiedGooglePlaySubscription> {
    if (!purchaseToken || purchaseToken.length > 4096) {
      throw ApiError.badRequest("Invalid Google Play purchase token.");
    }

    const token = await accessToken();
    const packageName = encodeURIComponent(env.GOOGLE_PLAY_PACKAGE_NAME);
    const encodedPurchaseToken = encodeURIComponent(purchaseToken);
    const response = await fetch(
      `${ANDROID_PUBLISHER_BASE}/applications/${packageName}/purchases/subscriptionsv2/tokens/${encodedPurchaseToken}`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (response.status === 404) throw ApiError.badRequest("Google Play purchase was not found.");
    if (!response.ok) throw new ApiError(502, "Google Play purchase verification failed.");

    const purchase = (await response.json()) as GoogleSubscriptionPurchaseV2;
    if (purchase.subscriptionState !== "SUBSCRIPTION_STATE_ACTIVE") {
      throw new ApiError(409, "Google Play subscription is not active.", {
        code: "GOOGLE_PLAY_SUBSCRIPTION_NOT_ACTIVE",
      });
    }

    if (expectedUserId) {
      const expectedAccountId = obfuscatedAccountId(expectedUserId);
      if (purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId !== expectedAccountId) {
        throw new ApiError(409, "Google Play purchase belongs to a different Diewish account.", {
          code: "GOOGLE_PLAY_ACCOUNT_MISMATCH",
        });
      }
    }

    const now = new Date();
    const activeLineItems = (purchase.lineItems ?? [])
      .map((item) => ({ ...item, expiry: item.expiryTime ? new Date(item.expiryTime) : null }))
      .filter(
        (item) =>
          item.productId &&
          item.expiry &&
          Number.isFinite(item.expiry.getTime()) &&
          item.expiry > now,
      );

    const lineItem = activeLineItems.sort((a, b) => b.expiry!.getTime() - a.expiry!.getTime())[0];
    if (!lineItem?.productId || !lineItem.expiry) {
      throw new ApiError(409, "Google Play subscription has no active entitlement.");
    }

    const tier = tierForProduct(lineItem.productId);
    if (!tier) throw new ApiError(409, "Google Play product is not recognized by Diewish.");

    const start = purchase.startTime ? new Date(purchase.startTime) : null;
    const startedAt = start && Number.isFinite(start.getTime()) ? start : null;

    return {
      tier,
      productId: lineItem.productId,
      purchaseToken,
      linkedPurchaseToken: purchase.linkedPurchaseToken ?? null,
      startedAt,
      expiresAt: lineItem.expiry,
      acknowledgementPending: purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING",
      orderId: purchase.latestOrderId ?? null,
      obfuscatedAccountId: purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
      rawState: "SUBSCRIPTION_STATE_ACTIVE",
    };
  },

  /**
   * Acknowledges only after Diewish has durably granted the verified entitlement.
   * Calling this for an already-acknowledged purchase is unnecessary, so callers
   * should use acknowledgementPending from verifySubscription first.
   */
  async acknowledgeSubscription(productId: string, purchaseToken: string): Promise<void> {
    const tier = tierForProduct(productId);
    if (!tier) throw ApiError.badRequest("Unknown Google Play subscription product.");

    const token = await accessToken();
    const packageName = encodeURIComponent(env.GOOGLE_PLAY_PACKAGE_NAME);
    const subscriptionId = encodeURIComponent(productId);
    const encodedPurchaseToken = encodeURIComponent(purchaseToken);
    const response = await fetch(
      `${ANDROID_PUBLISHER_BASE}/applications/${packageName}/purchases/subscriptions/${subscriptionId}/tokens/${encodedPurchaseToken}:acknowledge`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      throw new ApiError(502, "Google Play purchase acknowledgement failed.", {
        code: "GOOGLE_PLAY_ACKNOWLEDGEMENT_FAILED",
      });
    }
  },
};
