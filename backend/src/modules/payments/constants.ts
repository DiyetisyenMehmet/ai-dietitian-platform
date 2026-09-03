/**
 * Subscription plan catalog and billing constants.
 * Prices are held in MINOR currency units (kuruş for TRY) to avoid floating-point rounding.
 */

import type { SubscriptionTier } from "@prisma/client";

export interface PlanDefinition {
  tier: SubscriptionTier;
  code: string;
  name: string;
  priceMinor: number;
  currency: string;
  periodDays: number;
  description: string;
}

export const BILLING_PERIOD_DAYS = 30;

/** Version stamped into the checkout audit when purchase disclosures are accepted. */
export const PURCHASE_TERMS_VERSION = "2026-09-03";

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
    description: "En yüksek mevcut AI kotaları ve genişletilmiş kullanım limitleri.",
  },
};

export const PAID_TIERS: SubscriptionTier[] = ["PREMIUM", "PREMIUM_PLUS"];
export const ENTITLEMENT_REQUIRED_CODE = "SUBSCRIPTION_REQUIRED";
export const PAYMENT_PROVIDER_UNCONFIGURED_CODE = "PAYMENT_PROVIDER_UNCONFIGURED";
export const WEBHOOK_SIGNATURE_INVALID_CODE = "WEBHOOK_SIGNATURE_INVALID";
