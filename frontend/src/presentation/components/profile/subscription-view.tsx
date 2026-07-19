"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, CreditCard, Crown, Sparkles } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { formatLongDate } from "@/shared/lib/format";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { PUBLIC_PLANS } from "@/shared/constants/site";
import {
  useSubscription,
  subscriptionStore,
  planForTier,
  priceForCycle,
  TIER_ORDER,
} from "@/application/payments/subscription-store";
import type { BillingCycle } from "@/domain/payments/types";

const tryFmt = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
});

function formatTry(amount: number): string {
  return tryFmt.format(amount);
}

const STATUS_LABEL: Record<string, string> = {
  active: "Aktif",
  canceled: "İptal edildi",
  past_due: "Ödeme bekliyor",
};

/** Full subscription management screen — plans, billing and payment method. */
export function SubscriptionView() {
  const { subscription, billingHistory, paymentMethod } = useSubscription();
  const [cycle, setCycle] = React.useState<BillingCycle>(subscription.cycle);

  const currentPlan = planForTier(subscription.tier);
  const isPaid = subscription.tier !== "FREE";

  const onChangePlan = (tier: (typeof PUBLIC_PLANS)[number]["tier"]) => {
    if (tier === subscription.tier && subscription.status === "active") return;
    subscriptionStore.changePlan(tier, cycle);
    const name = planForTier(tier).name;
    toast.success(
      tier === "FREE" ? "Free plana geçtin." : `${name} planına geçtin 🎉`,
      { description: tier !== "FREE" ? `${cycle === "yearly" ? "Yıllık" : "Aylık"} fatura oluşturuldu.` : undefined },
    );
  };

  const onCancel = () => {
    subscriptionStore.cancel();
    toast.info("Aboneliğin dönem sonunda sonlanacak.", {
      description: "Dilediğin zaman yeniden etkinleştirebilirsin.",
    });
  };

  const onResume = () => {
    subscriptionStore.resume();
    toast.success("Aboneliğin yeniden etkinleştirildi.");
  };

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/12 via-accent to-background p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              {subscription.tier === "PREMIUM_PLUS" ? (
                <Crown className="size-6" aria-hidden="true" />
              ) : (
                <Sparkles className="size-6" aria-hidden="true" />
              )}
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Mevcut planın</p>
              <p className="text-lg font-bold">{currentPlan.name}</p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              subscription.status === "active"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
          >
            {STATUS_LABEL[subscription.status] ?? subscription.status}
          </span>
        </div>

        {isPaid && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border/60 bg-card/60 p-3 backdrop-blur">
              <p className="text-[11px] text-muted-foreground">Ödeme döngüsü</p>
              <p className="text-sm font-semibold">
                {subscription.cycle === "yearly" ? "Yıllık" : "Aylık"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/60 p-3 backdrop-blur">
              <p className="text-[11px] text-muted-foreground">
                {subscription.cancelAtPeriodEnd ? "Bitiş tarihi" : "Yenilenme tarihi"}
              </p>
              <p className="text-sm font-semibold">
                {formatLongDate(new Date(subscription.renewsAt))}
              </p>
            </div>
          </div>
        )}

        {isPaid && (
          <div className="mt-4">
            {subscription.cancelAtPeriodEnd ? (
              <Button variant="outline" className="w-full" onClick={onResume}>
                Aboneliği sürdür
              </Button>
            ) : (
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={onCancel}>
                Aboneliği iptal et
              </Button>
            )}
          </div>
        )}
      </section>

      {/* Billing cycle toggle */}
      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-full border border-border bg-muted p-1">
          {(["monthly", "yearly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-semibold transition-all",
                cycle === c ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {c === "monthly" ? "Aylık" : "Yıllık"}
              {c === "yearly" && (
                <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  2 ay bedava
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Plans */}
      <section className="space-y-3">
        {PUBLIC_PLANS.map((plan) => {
          const isCurrent = plan.tier === subscription.tier;
          const price = priceForCycle(plan, cycle);
          const perMonth = cycle === "yearly" ? plan.yearlyMonthlyPrice : plan.monthlyPrice;
          const isUpgrade = TIER_ORDER[plan.tier] > TIER_ORDER[subscription.tier];
          return (
            <Card
              key={plan.tier}
              className={cn(
                "overflow-hidden transition-shadow",
                isCurrent ? "border-primary ring-1 ring-primary" : "hover:shadow-card-hover",
              )}
            >
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-bold">{plan.name}</p>
                      {plan.featured && (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                          Popüler
                        </span>
                      )}
                      {isCurrent && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                          Mevcut
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold tabular-nums">
                      {plan.tier === "FREE" ? "Ücretsiz" : formatTry(perMonth)}
                    </p>
                    {plan.tier !== "FREE" && (
                      <p className="text-[11px] text-muted-foreground">
                        /ay{cycle === "yearly" ? ` • ${formatTry(price)}/yıl` : ""}
                      </p>
                    )}
                  </div>
                </div>

                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent && subscription.status === "active" ? (
                  <Button variant="outline" className="w-full" disabled>
                    Mevcut planın
                  </Button>
                ) : (
                  <Button
                    variant={isUpgrade || plan.featured ? "default" : "outline"}
                    className="w-full"
                    onClick={() => onChangePlan(plan.tier)}
                  >
                    {plan.tier === "FREE"
                      ? "Free'ye geç"
                      : isUpgrade
                        ? `${plan.name} planına yükselt`
                        : `${plan.name} planına geç`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Payment method */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold">Ödeme Yöntemi</h3>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CreditCard className="size-5" aria-hidden="true" />
            </span>
            {paymentMethod ? (
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  {paymentMethod.brand} •••• {paymentMethod.last4}
                </p>
                <p className="text-xs text-muted-foreground">
                  Son kullanma {String(paymentMethod.expMonth).padStart(2, "0")}/{paymentMethod.expYear} • {paymentMethod.holderName}
                </p>
              </div>
            ) : (
              <p className="flex-1 text-sm text-muted-foreground">Kayıtlı ödeme yöntemi yok.</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                toast.info("Ödeme yöntemi", {
                  description: "Kart bilgilerin güvenli ödeme sağlayıcısı üzerinden güncellenir.",
                })
              }
            >
              Düzenle
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Billing history */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold">Fatura Geçmişi</h3>
        {billingHistory.length === 0 ? (
          <Card>
            <CardContent className="p-5 text-center text-sm text-muted-foreground">
              Henüz bir fatura kaydın yok.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {billingHistory.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatLongDate(new Date(entry.date))} • {entry.invoiceNo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatTry(entry.amount)}</p>
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        entry.status === "paid"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground",
                      )}
                    >
                      {entry.status === "paid" ? "Ödendi" : entry.status === "refunded" ? "İade" : "Başarısız"}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <p className="px-1 text-center text-xs text-muted-foreground">
        Bu, mevcut ödeme altyapısını kullanan bir demo abonelik akışıdır. Gerçek ödeme entegrasyonu
        yönetici tarafından etkinleştirildiğinde işlemler canlı hâle gelir.
      </p>
    </div>
  );
}
