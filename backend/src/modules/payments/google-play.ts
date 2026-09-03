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
  expiresAt: Date;
  acknowledgementPending: boolean;
  orderId: string | null;
  obfuscatedAccountId: string | null;
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
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new ApiError(502, "Google Play authorization failed.");
  }

  const payload = (await response.json()) as GoogleTokenResponse;
  if (!payload.access_token) throw new ApiError(502, "Google Play returned an invalid authorization response.");

  cachedAccessToken = {
    token: payload.access_token,
    expiresAtMs: nowMs + Math.max(60, payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}

export const googlePlayBilling = {
  isConfigured,

  /**
   * Verifies a subscription purchase directly with Google Play. The client-sent
   * product id is never trusted: the tier is derived from Google's line item.
   * PENDING/paused/expired/canceled purchases never grant Diewish entitlement.
   */
  async verifySubscription(purchaseToken: string): Promise<VerifiedGooglePlaySubscription> {
    if (!purchaseToken || purchaseToken.length > 4096) throw ApiError.badRequest("Invalid Google Play purchase token.");

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

    const activeLineItems = (purchase.lineItems ?? [])
      .map((item) => ({ ...item, expiry: item.expiryTime ? new Date(item.expiryTime) : null }))
      .filter((item) => item.productId && item.expiry && Number.isFinite(item.expiry.getTime()) && item.expiry > new Date());

    const lineItem = activeLineItems.sort((a, b) => b.expiry!.getTime() - a.expiry!.getTime())[0];
    if (!lineItem?.productId || !lineItem.expiry) throw new ApiError(409, "Google Play subscription has no active entitlement.");

    const tier = tierForProduct(lineItem.productId);
    if (!tier) throw new ApiError(409, "Google Play product is not recognized by Diewish.");

    return {
      tier,
      productId: lineItem.productId,
      purchaseToken,
      expiresAt: lineItem.expiry,
      acknowledgementPending: purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING",
      orderId: purchase.latestOrderId ?? null,
      obfuscatedAccountId: purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    };
  },
};
