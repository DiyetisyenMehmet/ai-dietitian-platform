"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { PUBLIC_PLANS, type PublicPlan } from "@/shared/constants/site";
import { beginCheckout } from "@/application/payments/checkout";
import type { PaidTier } from "@/domain/payments/types";
import { Button } from "@/presentation/components/ui/button";
import { cn } from "@/shared/lib/utils";

type BillingCycle = "monthly" | "yearly";

/** Formats a TRY amount as e.g. "149,99 ₺" (Turkish locale). */
function formatTry(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/**
 * Public pricing cards with a monthly/yearly billing toggle. "Buy" buttons wire
 * into the existing iyzico checkout via {@link beginCheckout}: guests are routed
 * to registration (carrying the plan), signed-in users are sent to the hosted
 * payment page.
 */
export function PricingCards() {
  const router = useRouter();
  const [cycle, setCycle] = React.useState<BillingCycle>("monthly");
  const [pendingTier, setPendingTier] = React.useState<PaidTier | null>(null);

  async function handleSelect(plan: PublicPlan) {
    if (plan.tier === "FREE") {
      router.push("/register");
      return;
    }

    const tier = plan.tier as PaidTier;
    setPendingTier(tier);
    try {
      const outcome = await beginCheckout(tier);
      switch (outcome.kind) {
        case "auth-required":
          router.push(outcome.redirectTo);
          break;
        case "redirect":
          window.location.href = outcome.url;
          break;
        case "form": {
          const win = window.open("", "_blank");
          if (win) {
            win.document.write(outcome.html);
            win.document.close();
          } else {
            toast.error("Açılır pencere engellendi. Lütfen izin verip tekrar deneyin.");
          }
          break;
        }
        case "error":
          toast.error(outcome.message);
          break;
      }
    } finally {
      setPendingTier(null);
    }
  }

  return (
    <div className="space-y-10">
      {/* Billing toggle */}
      <div className="flex items-center justify-center">
        <div
          role="tablist"
          aria-label="Faturalandırma dönemi"
          className="inline-flex rounded-full border border-border bg-muted/50 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={cycle === "monthly"}
            onClick={() => setCycle("monthly")}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-medium transition-colors",
              cycle === "monthly"
                ? "bg-background text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Aylık
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cycle === "yearly"}
            onClick={() => setCycle("yearly")}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-medium transition-colors",
              cycle === "yearly"
                ? "bg-background text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Yıllık
            <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              2 ay ücretsiz
            </span>
          </button>
        </div>
      </div>

      {/* Plan grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {PUBLIC_PLANS.map((plan) => {
          const isFree = plan.tier === "FREE";
          const displayPrice =
            cycle === "yearly" ? plan.yearlyMonthlyPrice : plan.monthlyPrice;
          return (
            <div
              key={plan.tier}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-card p-6 shadow-card transition-shadow hover:shadow-card-hover",
                plan.featured ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  En Popüler
                </span>
              )}

              <div className="space-y-1">
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.tagline}</p>
              </div>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">
                  {isFree ? "0 ₺" : formatTry(displayPrice)}
                </span>
                {!isFree && <span className="text-sm text-muted-foreground">/ay</span>}
              </div>
              {!isFree && cycle === "yearly" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Yıllık {formatTry(plan.yearlyPrice)} olarak faturalandırılır
                </p>
              )}
              {isFree && <p className="mt-1 text-xs text-muted-foreground">Süresiz ücretsiz</p>}

              <Button
                className="mt-6 w-full"
                variant={plan.featured ? "default" : "outline"}
                isLoading={pendingTier === plan.tier}
                onClick={() => handleSelect(plan)}
              >
                {plan.cta}
              </Button>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Tüm fiyatlara KDV dahildir. Ödemeler iyzico güvencesiyle işlenir. İstediğin an iptal
        edebilirsin.
      </p>
    </div>
  );
}
