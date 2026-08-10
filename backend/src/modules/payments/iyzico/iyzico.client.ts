/**
 * Low-level iyzico REST client (Sprint 15, D2).
 *
 * Implements iyzico's IYZWSv2 request authentication (HMAC-SHA256 over
 * randomKey + uriPath + payload) and a thin `POST` helper. This layer knows
 * nothing about subscriptions — it only signs and ships requests — so the
 * provider layer above it can stay focused on mapping domain intent to iyzico
 * endpoints.
 *
 * Secrets are read lazily from validated env; the client reports `isConfigured`
 * so callers can fail fast with a clear error rather than sending unauthorized
 * requests when credentials are absent.
 */

import crypto from "node:crypto";

import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";

/** Shape returned by every helper: the parsed JSON plus the HTTP status. */
export interface IyzicoResponse {
  status: number;
  body: Record<string, unknown>;
}

function base64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

/** HMAC-SHA256 hex digest — used for the IYZWSv2 request signature. */
function hmacHex(key: string, data: string): string {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("hex");
}

/** HMAC-SHA256 base64 digest — used for webhook signature verification. */
function hmacBase64(key: string, data: string): string {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("base64");
}

/** Timing-safe string comparison that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export const iyzicoClient = {
  /** True when both API credentials are present. */
  isConfigured(): boolean {
    return Boolean(env.IYZICO_API_KEY && env.IYZICO_SECRET_KEY);
  },

  /** The secret used to verify inbound webhook signatures (falls back to API secret). */
  webhookSecret(): string | undefined {
    return env.IYZICO_WEBHOOK_SECRET ?? env.IYZICO_SECRET_KEY;
  },

  /**
   * Builds IYZWSv2 authorization headers for a request.
   *
   * signature = HMAC_SHA256_hex(secretKey, randomKey + uriPath + payloadJson)
   * Authorization = "IYZWSv2 " + base64("apiKey:..&randomKey:..&signature:..")
   */
  buildAuthHeaders(uriPath: string, payloadJson: string): Record<string, string> {
    const apiKey = env.IYZICO_API_KEY ?? "";
    const secretKey = env.IYZICO_SECRET_KEY ?? "";
    const randomKey = `${Date.now()}${crypto.randomBytes(8).toString("hex")}`;
    const signature = hmacHex(secretKey, randomKey + uriPath + payloadJson);
    const authorizationParams = `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`;
    return {
      "Content-Type": "application/json",
      Authorization: `IYZWSv2 ${base64(authorizationParams)}`,
      "x-iyzi-rnd": randomKey,
    };
  },

  /**
   * Signs and sends a POST to an iyzico endpoint. Network/parse failures are
   * surfaced to the caller (the payment service maps them to a 502-style error).
   */
  async post(uriPath: string, payload: Record<string, unknown>): Promise<IyzicoResponse> {
    const payloadJson = JSON.stringify(payload);
    const headers = this.buildAuthHeaders(uriPath, payloadJson);
    const url = `${env.IYZICO_BASE_URL}${uriPath}`;

    const res = await fetch(url, { method: "POST", headers, body: payloadJson });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      logger.error({ uriPath, status: res.status }, "iyzico returned a non-JSON response");
    }
    return { status: res.status, body };
  },

  /**
   * Verifies a webhook signature. iyzico signs notifications with an HMAC over
   * a canonical concatenation of the secret and stable event fields; the result
   * is base64-encoded and delivered in the signature header. We recompute it and
   * compare constant-time. Fails CLOSED when no secret is configured.
   */
  verifyWebhookSignature(canonicalString: string, providedSignature: string | undefined): boolean {
    const secret = this.webhookSecret();
    if (!secret || !providedSignature) return false;
    const expected = hmacBase64(secret, canonicalString);
    return safeEqual(expected, providedSignature.trim());
  },
};
