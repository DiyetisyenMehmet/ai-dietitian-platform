/**
 * Subscription plan catalog and billing constants (Sprint 15, D1–D3).
 *
 * A single source of truth for what each tier costs and offers. Prices are held
 * in MINOR currency units (kuruş for TRY) to avoid floating-point rounding in
 * money math. The catalog is intentionally data-only so the payment provider,
 * the subscription service and the API can all read the same definitions
 * without duplicating pricing logic.
 */

import type { SubscriptionTier } from "@prisma/client";

/** A purchasable plan definition. */
export interface PlanDefinition {
  tier: SubscriptionTier;
  /** Stable machine code (also used as the iyzico basket-item id). */
  code: string;
  /** Human-readable name shown in billing UI. */
  name: string;
  /** Price in minor units (kuruş). FREE is 0 and never hits the processor. */
  priceMinor: number;
  currency: string;
  /** Billing period length in days (monthly = 30 for V1). */
  periodDays: number;
  /** Short marketing description. */
  description: string;
}

/** Length of a monthly billing period, in days. */
export const BILLING_PERIOD_DAYS = 30;

/**
 * The plan catalog. FREE is the default, non-billable tier every account starts
 * on. PREMIUM and PREMIUM_PLUS are paid monthly plans purchased through iyzico.
 * Prices are examples for V1 and can be tuned here without code changes
 * elsewhere.
 */
export const PLAN_CATALOG: Record<SubscriptionTier, PlanDefinition> = {
  FREE: {
    tier: "FREE",
    code: "diewish_free",
    name: "Diewish Free",
    priceMinor: 0,
    currency: "TRY",
    periodDays: BILLING_PERIOD_DAYS,
    description: "Temel özellikler ve sınırlı AI kullanımı.",
  },
  PREMIUM: {
    tier: "PREMIUM",
    code: "diewish_premium",
    name: "Diewish Premium",
    priceMinor: 14999,
    currency: "TRY",
    periodDays: BILLING_PERIOD_DAYS,
    description: "Genişletilmiş AI kotaları, kan tahlili analizi ve beslenme planları.",
  },
  PREMIUM_PLUS: {
    tier: "PREMIUM_PLUS",
    code: "diewish_premium_plus",
    name: "Diewish Premium Plus",
    priceMinor: 29999,
    currency: "TRY",
    periodDays: BILLING_PERIOD_DAYS,
    description: "En yüksek AI kotaları ve öncelikli erişim.",
  },
};

/** The paid tiers (everything except FREE), in ascending order. */
export const PAID_TIERS: SubscriptionTier[] = ["PREMIUM", "PREMIUM_PLUS"];

/** Machine-readable error code surfaced when a required entitlement is missing. */
export const ENTITLEMENT_REQUIRED_CODE = "SUBSCRIPTION_REQUIRED";

/** Machine-readable error code surfaced when the payment provider is unconfigured. */
export const PAYMENT_PROVIDER_UNCONFIGURED_CODE = "PAYMENT_PROVIDER_UNCONFIGURED";

/** Machine-readable error code surfaced when a webhook signature fails to verify. */
export const WEBHOOK_SIGNATURE_INVALID_CODE = "WEBHOOK_SIGNATURE_INVALID";
