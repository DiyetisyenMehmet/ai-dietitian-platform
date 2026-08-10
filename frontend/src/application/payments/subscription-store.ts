"use client";

import * as React from "react";

import type {
  BillingCycle,
  BillingHistoryEntry,
  PaymentMethod,
  SubscriptionTier,
  UserSubscription,
} from "@/domain/payments/types";
import { PUBLIC_PLANS, type PublicPlan } from "@/shared/constants/site";

/**
 * In-memory subscription store shared via useSyncExternalStore, mirroring the
 * pattern of the health stores. It stands in for the authenticated
 * `GET /subscription` + payments endpoints so the management UI is fully
 * interactive in V1; the shape matches the backend contract so it can later be
 * swapped for live data without touching presentation components.
 *
 * State is persisted to localStorage so a chosen plan survives reloads within
 * the session (purely a UX nicety — the source of truth remains the backend).
 */

const STORAGE_KEY = "diewish.subscription.v1";

/** Ordered tiers for upgrade/downgrade comparisons. */
export const TIER_ORDER: Record<SubscriptionTier, number> = {
  FREE: 0,
  PREMIUM: 1,
  PREMIUM_PLUS: 2,
};

interface SubscriptionState {
  subscription: UserSubscription;
  billingHistory: BillingHistoryEntry[];
  paymentMethod: PaymentMethod | null;
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seed(): SubscriptionState {
  return {
    subscription: {
      tier: "PREMIUM",
      status: "active",
      cycle: "monthly",
      startedAt: isoOffset(-40),
      renewsAt: isoOffset(-40 + 30),
      cancelAtPeriodEnd: false,
    },
    billingHistory: [
      {
        id: "inv-3",
        date: isoOffset(-10),
        description: "Premium — Aylık",
        amount: 149.99,
        status: "paid",
        invoiceNo: "DW-2024-003",
      },
      {
        id: "inv-2",
        date: isoOffset(-40),
        description: "Premium — Aylık",
        amount: 149.99,
        status: "paid",
        invoiceNo: "DW-2024-002",
      },
      {
        id: "inv-1",
        date: isoOffset(-70),
        description: "Premium — Aylık",
        amount: 149.99,
        status: "paid",
        invoiceNo: "DW-2024-001",
      },
    ],
    paymentMethod: {
      brand: "Visa",
      last4: "4242",
      expMonth: 8,
      expYear: 27,
      holderName: "MEHMET YILMAZ",
    },
  };
}

function load(): SubscriptionState {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SubscriptionState;
  } catch {
    // Ignore corrupt/unavailable storage — fall back to seed.
  }
  return seed();
}

let state: SubscriptionState = seed();
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  state = { ...state };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable — degrade gracefully.
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  // Hydrate from storage lazily on first subscription (client-only).
  if (!hydrated) {
    hydrated = true;
    state = load();
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return state;
}

/** Looks up the public plan definition for a tier. */
export function planForTier(tier: SubscriptionTier): PublicPlan {
  return PUBLIC_PLANS.find((p) => p.tier === tier) ?? PUBLIC_PLANS[0];
}

/** Price (TRY, major units) for a tier + cycle. Yearly returns the annual total. */
export function priceForCycle(plan: PublicPlan, cycle: BillingCycle): number {
  return cycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
}

let invoiceUid = 100;

export const subscriptionStore = {
  /** Switches the plan/cycle (upgrade or downgrade) and records an invoice. */
  changePlan(tier: SubscriptionTier, cycle: BillingCycle) {
    const plan = planForTier(tier);
    const now = isoOffset(0);
    const renews = cycle === "yearly" ? isoOffset(365) : isoOffset(30);
    state.subscription = {
      tier,
      status: "active",
      cycle,
      startedAt: now,
      renewsAt: tier === "FREE" ? now : renews,
      cancelAtPeriodEnd: false,
    };
    if (tier !== "FREE") {
      const amount = priceForCycle(plan, cycle);
      state.billingHistory = [
        {
          id: `inv-${invoiceUid++}`,
          date: now,
          description: `${plan.name} — ${cycle === "yearly" ? "Yıllık" : "Aylık"}`,
          amount,
          status: "paid",
          invoiceNo: `DW-2024-${String(invoiceUid).padStart(3, "0")}`,
        },
        ...state.billingHistory,
      ];
    }
    emit();
  },

  /** Schedules cancellation at period end (keeps access until renewsAt). */
  cancel() {
    state.subscription = {
      ...state.subscription,
      status: "canceled",
      cancelAtPeriodEnd: true,
    };
    emit();
  },

  /** Reactivates a subscription that was scheduled to cancel. */
  resume() {
    state.subscription = {
      ...state.subscription,
      status: "active",
      cancelAtPeriodEnd: false,
    };
    emit();
  },

  /** Replaces the saved payment method. */
  setPaymentMethod(method: PaymentMethod) {
    state.paymentMethod = method;
    emit();
  },
};

export interface SubscriptionSnapshot {
  subscription: UserSubscription;
  billingHistory: BillingHistoryEntry[];
  paymentMethod: PaymentMethod | null;
}

/** Subscribe to the current subscription state. */
export function useSubscription(): SubscriptionSnapshot {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
