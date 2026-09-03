"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PUBLIC_PLANS, type PublicPlan } from "@/shared/constants/site";
import { beginCheckout } from "@/application/payments/checkout";
import { paymentsClient } from "@/infrastructure/payments/payments-client";
import type { PaidTier, PlanDto } from "@/domain/payments/types";
import { Button } from "@/presentation/components/ui/button";
import { cn } from "@/shared/lib/utils";

/** Formats backend-owned minor currency units for display. */
function formatMoney(plan: PlanDto): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: plan.currency,
    minimumFractionDigits: 2,
  }).format(plan.priceMinor / 100);
}

/**
 * Public pricing cards. Price and billing period come from the backend catalog,
 * which is the commercial source of truth. V1 sells one 30-day access period;
 * no annual or automatic-renewal promise is shown until recurring billing is
 * actually implemented at the payment-provider layer.
 */
export function PricingCards() {
  const router = useRouter();
  const [pendingTier, setPendingTier] = React.useState<PaidTier | null>(null);
  const [backendPlans, setBackendPlans] = React.useState<PlanDto[]>([]);
  const [plansLoading, setPlansLoading] = React.useState(true);
  const [plansError, setPlansError] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void paymentsClient
      .listPlans()
      .then((result) => {
        if (!active) return;
        setBackendPlans(result.plans);
        setPlansError(false);
      })
      .catch(() => {
        if (!active) return;
        setBackendPlans([]);
        setPlansError(true);
      })
      .finally(() => {
        if (active) setPlansLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
          window.location.assign(outcome.url);
          break;
        case "error":
          toast.error(outcome.message);
          break;
      }
    } finally {
      setPendingTier(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-muted/40 p-4 text-center">
        <p className="text-sm font-medium">Şu an desteklenen ücretli dönem: 30 günlük erişim</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Otomatik yenileme ve yıllık ödeme henüz sunulmuyor. Yeni dönem için kullanıcı yeniden ödeme başlatır.
        </p>
      </div>

      {plansError && (
        <p className="text-center text-sm text-destructive">
          Güncel fiyat bilgileri şu anda alınamıyor. Ödeme butonları güvenlik nedeniyle kapalıdır.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {PUBLIC_PLANS.map((plan) => {
          const isFree = plan.tier === "FREE";
          const backendPlan = backendPlans.find((candidate) => candidate.tier === plan.tier);
          const paidUnavailable = !isFree && !backendPlan;

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
                  {isFree ? (
                    "0 ₺"
                  ) : plansLoading ? (
                    <span className="inline-flex items-center gap-2 text-lg text-muted-foreground">
                      <Loader2 className="size-5 animate-spin" aria-hidden="true" /> Yükleniyor
                    </span>
                  ) : backendPlan ? (
                    formatMoney(backendPlan)
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {isFree
                  ? "Süresiz ücretsiz"
                  : backendPlan
                    ? `${backendPlan.periodDays} günlük erişim`
                    : "Fiyat doğrulanamadı"}
              </p>

              <Button
                className="mt-6 w-full"
                variant={plan.featured ? "default" : "outline"}
                isLoading={pendingTier === plan.tier}
                disabled={paidUnavailable || plansLoading || pendingTier !== null}
                onClick={() => void handleSelect(plan)}
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
        Fiyat ve dönem bilgileri Diewish ödeme sunucusundan doğrulanır. Kart bilgileri Diewish sunucularında saklanmaz.
      </p>
    </div>
  );
}
