/**
 * iyzico implementation of the {@link PaymentProvider} abstraction (Sprint 15).
 *
 * Maps Diewish's provider-agnostic checkout/subscription intent onto iyzico's
 * Checkout Form (hosted payment) endpoints and normalizes responses back into
 * the domain types. Card data never touches our servers — the hosted form owns
 * PCI scope — so only tokens/ids and non-sensitive status flow through here.
 */

import { logger } from "../../../lib/logger";
import type {
  InitializeCheckoutInput,
  InitializeCheckoutResult,
  ParsedWebhookEvent,
  ProviderPaymentResult,
} from "../types";
import { iyzicoClient } from "./iyzico.client";
import type { PaymentProvider } from "./payment-provider.interface";

const INITIALIZE_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
const RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail";

/** Converts minor units (kuruş) to iyzico's decimal price string ("149.99"). */
function toDecimalString(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Splits a display name into iyzico's required name/surname fields. */
function splitName(fullName: string | null | undefined): { name: string; surname: string } {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return { name: "Diewish", surname: "User" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { name: parts[0], surname: parts[0] };
  return { name: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
}

/** Reads a string field from an unknown object, or null. */
function str(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : v == null ? null : String(v);
}

export const iyzicoProvider: PaymentProvider = {
  id: "IYZICO",

  isConfigured(): boolean {
    return iyzicoClient.isConfigured();
  },

  async initializeCheckout(input: InitializeCheckoutInput): Promise<InitializeCheckoutResult> {
    const price = toDecimalString(input.priceMinor);
    const { name, surname } = splitName(input.buyer.fullName);

    // Minimal, hosted-checkout-appropriate payload. Address/identity fields are
    // required by iyzico; for a digital subscription we send neutral defaults
    // (the hosted form collects/validates real billing details). No card data.
    const payload: Record<string, unknown> = {
      locale: "tr",
      conversationId: input.conversationId,
      price,
      paidPrice: price,
      currency: input.currency,
      basketId: input.planCode,
      paymentGroup: "SUBSCRIPTION",
      callbackUrl: input.callbackUrl,
      enabledInstallments: [1],
      buyer: {
        id: input.buyer.id,
        name,
        surname,
        email: input.buyer.email,
        identityNumber: "11111111111",
        registrationAddress: "N/A",
        ip: input.buyer.ipAddress ?? "0.0.0.0",
        city: "Istanbul",
        country: "Turkey",
      },
      billingAddress: {
        contactName: `${name} ${surname}`,
        city: "Istanbul",
        country: "Turkey",
        address: "N/A",
      },
      basketItems: [
        {
          id: input.planCode,
          name: input.planName,
          category1: "Subscription",
          itemType: "VIRTUAL",
          price,
        },
      ],
    };

    const { body } = await iyzicoClient.post(INITIALIZE_PATH, payload);
    if (str(body, "status") !== "success") {
      const message = str(body, "errorMessage") ?? "iyzico checkout initialization failed";
      logger.error({ conversationId: input.conversationId, body }, "iyzico initialize failed");
      throw new Error(message);
    }

    return {
      providerToken: str(body, "token") ?? "",
      paymentPageUrl: str(body, "paymentPageUrl") ?? undefined,
      checkoutFormContent: str(body, "checkoutFormContent") ?? undefined,
    };
  },

  async retrievePayment(providerToken: string): Promise<ProviderPaymentResult> {
    const payload = { locale: "tr", token: providerToken };
    const { body } = await iyzicoClient.post(RETRIEVE_PATH, payload);

    const rawStatus = str(body, "paymentStatus") ?? str(body, "status") ?? "UNKNOWN";
    const normalized =
      rawStatus === "SUCCESS" ? "SUCCEEDED" : rawStatus === "FAILURE" ? "FAILED" : "PENDING";

    const paidPrice = str(body, "paidPrice");
    return {
      status: normalized,
      rawStatus,
      providerPaymentId: str(body, "paymentId"),
      conversationId: str(body, "conversationId"),
      paidPriceMinor: paidPrice ? Math.round(parseFloat(paidPrice) * 100) : null,
      currency: str(body, "currency"),
      failureReason: str(body, "errorMessage"),
    };
  },

  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return false;
    }
    // Canonical signed string per iyzico's notification scheme: a concatenation
    // of the stable event fields. The HMAC key is the account/webhook secret
    // (applied inside the client). If iyzico's exact field order differs for a
    // given event version, adjust ONLY this canonical builder.
    const canonical = [
      str(payload, "iyziEventType") ?? "",
      str(payload, "iyziPaymentId") ?? str(payload, "paymentId") ?? "",
      str(payload, "paymentConversationId") ?? str(payload, "conversationId") ?? "",
      str(payload, "status") ?? "",
    ].join("");
    return iyzicoClient.verifyWebhookSignature(canonical, signatureHeader);
  },

  parseWebhook(payload: unknown): ParsedWebhookEvent {
    const obj = (payload ?? {}) as Record<string, unknown>;
    const eventType = str(obj, "iyziEventType") ?? "UNKNOWN";
    const referenceCode = str(obj, "iyziReferenceCode");
    const paymentId = str(obj, "iyziPaymentId") ?? str(obj, "paymentId");
    const conversationId =
      str(obj, "paymentConversationId") ?? str(obj, "conversationId");
    // A stable, provider-unique id for idempotency: prefer the reference code,
    // then payment id, finally a composite of type+conversation.
    const providerEventId =
      referenceCode ?? paymentId ?? `${eventType}:${conversationId ?? "unknown"}`;
    return {
      providerEventId,
      eventType,
      conversationId,
      providerPaymentToken: str(obj, "token"),
      rawStatus: str(obj, "status"),
    };
  },
};
