"use client";

import * as React from "react";

import type {
  BillingCycle,
  CheckoutResult,
  PaidTier,
  PaymentDto,
  PlanDto,
  PurchaseAcceptance,
  SubscriptionStatusDto,
  SubscriptionTier,
} from "@/domain/payments/types";
import { PUBLIC_PLANS, type PublicPlan } from "@/shared/constants/site";
import { paymentsClient } from "@/infrastructure/payments/payments-client";

export const TIER_ORDER: Record<SubscriptionTier, number> = {
  FREE: 0,
  PREMIUM: 1,
  PREMIUM_PLUS: 2,
};

interface SubscriptionState {
  subscription: SubscriptionStatusDto;
  plans: PlanDto[];
  payments: PaymentDto[];
  loading: boolean;
  error: string | null;
}

function emptySubscription(): SubscriptionStatusDto {
  return {
    tier: "FREE",
    status: "NONE",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    entitlements: [],
  };
}

let state: SubscriptionState = {
  subscription: emptySubscription(),
  plans: [],
  payments: [],
  loading: false,
  error: null,
};

const listeners = new Set<() => void>();
let hydrationPromise: Promise<void> | null = null;
let hydrated = false;
let sessionGeneration = 0;

function emit() {
  state = { ...state };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function planForTier(tier: SubscriptionTier): PublicPlan {
  return PUBLIC_PLANS.find((plan) => plan.tier === tier) ?? PUBLIC_PLANS[0];
}

export function priceForCycle(plan: PublicPlan, cycle: BillingCycle): number {
  return cycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Abonelik bilgileri alınamadı.";
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydrationPromise) return hydrationPromise;

  const generation = sessionGeneration;
  state = { ...state, loading: true, error: null };
  emit();

  hydrationPromise = (async () => {
    try {
      // Entitlement is security/product critical and must not be coupled to
      // auxiliary billing-history requests. Previously Promise.all meant a
      // transient plans/payments failure downgraded the in-memory subscription
      // to FREE, hiding paid-only product features even when the authoritative
      // subscription endpoint had returned PREMIUM/PREMIUM_PLUS correctly.
      const subscription = await paymentsClient.getSubscription();
      if (generation !== sessionGeneration) return;

      // Publish the authoritative entitlement immediately and mark entitlement
      // loading complete. Plans and payment history are non-critical billing
      // decoration; they may still be loading or fail independently, but they
      // must never keep paid product features hidden after the source-of-truth
      // subscription endpoint has resolved.
      state = {
        ...state,
        subscription,
        loading: false,
        error: null,
      };
      emit();

      const [planResult, paymentResult] = await Promise.allSettled([
        paymentsClient.listPlans(),
        paymentsClient.listPayments(),
      ]);
      if (generation !== sessionGeneration) return;

      const auxiliaryErrors: unknown[] = [];
      const plans =
        planResult.status === "fulfilled"
          ? planResult.value.plans
          : (auxiliaryErrors.push(planResult.reason), state.plans);
      const payments =
        paymentResult.status === "fulfilled"
          ? paymentResult.value.payments
          : (auxiliaryErrors.push(paymentResult.reason), state.payments);

      state = {
        subscription,
        plans,
        payments,
        loading: false,
        error:
          auxiliaryErrors.length > 0
            ? "Bazı ödeme ayrıntıları şu anda alınamadı; abonelik durumun güncel."
            : null,
      };
      hydrated = true;
      emit();
    } catch (error) {
      if (generation !== sessionGeneration) return;
      // Do not overwrite a previously resolved paid entitlement with a synthetic
      // FREE value on a transient refresh error. A fresh session still starts at
      // FREE until the authoritative endpoint resolves, so this never fails open.
      state = {
        ...state,
        loading: false,
        error: errorMessage(error),
      };
      emit();
    } finally {
      if (generation === sessionGeneration) hydrationPromise = null;
    }
  })();

  return hydrationPromise;
}

export const subscriptionStore = {
  hydrate,

  async refresh(): Promise<void> {
    hydrated = false;
    await hydrate();
  },

  async startCheckout(
    tier: PaidTier,
    purchaseAcceptance: PurchaseAcceptance,
  ): Promise<CheckoutResult> {
    return paymentsClient.startCheckout(tier, purchaseAcceptance);
  },

  async cancelAtPeriodEnd(): Promise<void> {
    const subscription = await paymentsClient.cancelSubscription(true);
    state = { ...state, subscription, error: null };
    emit();
  },

  resetSession(): void {
    sessionGeneration += 1;
    hydrated = false;
    hydrationPromise = null;
    state = {
      subscription: emptySubscription(),
      plans: [],
      payments: [],
      loading: false,
      error: null,
    };
    emit();
  },
};

export interface SubscriptionSnapshot {
  subscription: SubscriptionStatusDto;
  plans: PlanDto[];
  payments: PaymentDto[];
  loading: boolean;
  error: string | null;
}

export function useSubscription(): SubscriptionSnapshot {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  React.useEffect(() => {
    void subscriptionStore.hydrate();
  }, []);

  return snapshot;
}
