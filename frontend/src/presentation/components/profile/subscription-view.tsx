"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, CreditCard, Crown, Loader2, Sparkles } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { formatLongDate } from "@/shared/lib/format";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { PUBLIC_PLANS } from "@/shared/constants/site";
import {
  useSubscription,
  subscriptionStore,
  planForTier,
  TIER_ORDER,
} from "@/application/payments/subscription-store";
import { ApiError } from "@/infrastructure/api/http-client";
import type { PaidTier, PaymentDto } from "@/domain/payments/types";

const STATUS_LABEL: Record<string, string> = {
  NONE: "Ücretsiz",
  PENDING: "Ödeme bekliyor",
  ACTIVE: "Aktif",
  PAST_DUE: "Ödeme sorunu",
  CANCELED: "İptal edildi",
  EXPIRED: "Sona erdi",
};

const PAYMENT_STATUS_LABEL: Record<PaymentDto["status"], string> = {
  PENDING: "Bekliyor",
  SUCCEEDED: "Ödendi",
  FAILED: "Başarısız",
  REFUNDED: "İade edildi",
};

function formatMoney(minor: number, currency = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

function paymentReference(payment: PaymentDto): string {
  const reference = payment.providerPaymentId ?? payment.id;
  return `#${reference.slice(-8)}`;
}

function checkoutError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "PAYMENT_PROVIDER_UNCONFIGURED") {
      return "Güvenli ödeme sistemi henüz bu ortamda etkinleştirilmemiş.";
    }
    return error.message;
  }
  return "Ödeme sayfası başlatılamadı. Lütfen tekrar dene.";
}

/**
 * Subscription management backed only by real server state. Diewish never
 * fabricates a paid plan, invoice or saved card and never grants Premium on the
 * client before iyzico/provider verification succeeds server-side.
 */
export function SubscriptionView() {
  const { subscription, plans, payments, loading, error } = useSubscription();
  const [checkoutTier, setCheckoutTier] = React.useState<PaidTier | null>(null);
  const [cancelling, setCancelling] = React.useState(false);

  const currentPlan = planForTier(subscription.tier);
  const isPaid = subscription.tier !== "FREE";

  const onCheckout = React.useCallback(async (tier: PaidTier) => {
    if (checkoutTier) return;
    setCheckoutTier(tier);
    try {
      const result = await subscriptionStore.startCheckout(tier);
      if (result.paymentPageUrl) {
        window.location.assign(result.paymentPageUrl);
        return;
      }

      toast.error("Ödeme sayfası açılamadı", {
        description:
          result.checkoutFormContent
            ? "Ödeme sağlayıcısı yönlendirme bağlantısı yerine gömülü form döndürdü. Bu ödeme akışı canlıya açılmadan tamamlanacak."
            : "Ödeme sağlayıcısından yönlendirme bağlantısı alınamadı.",
      });
    } catch (checkoutFailure) {
      toast.error("Ödeme başlatılamadı", { description: checkoutError(checkoutFailure) });
    } finally {
      setCheckoutTier(null);
    }
  }, [checkoutTier]);

  const onCancel = React.useCallback(async () => {
    if (cancelling || !isPaid) return;
    setCancelling(true);
    try {
      await subscriptionStore.cancelAtPeriodEnd();
      toast.success("Abonelik yenilemesi durduruldu", {
        description: "Mevcut ücretli erişimin dönem sonuna kadar devam edecek.",
      });
    } catch (cancelFailure) {
      toast.error("Abonelik iptal edilemedi", {
        description: cancelFailure instanceof Error ? cancelFailure.message : "Lütfen tekrar dene.",
      });
    } finally {
      setCancelling(false);
    }
  }, [cancelling, isPaid]);

  return (
    <div className="space-y-6">
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
              <p className="text-lg font-bold">{loading ? "Kontrol ediliyor…" : currentPlan.name}</p>
            </div>
          </div>
          {!loading && (
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                subscription.status === "ACTIVE"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {STATUS_LABEL[subscription.status] ?? subscription.status}
            </span>
          )}
        </div>

        {isPaid && subscription.currentPeriodEnd && (
          <div className="mt-4 rounded-2xl border border-border/60 bg-card/60 p-3 backdrop-blur">
            <p className="text-[11px] text-muted-foreground">
              {subscription.cancelAtPeriodEnd ? "Ücretli erişim bitiş tarihi" : "Mevcut dönem sonu"}
            </p>
            <p className="text-sm font-semibold">
              {formatLongDate(new Date(subscription.currentPeriodEnd))}
            </p>
          </div>
        )}

        {isPaid && subscription.status === "ACTIVE" && (
          <div className="mt-4">
            {subscription.cancelAtPeriodEnd ? (
              <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                Yenileme kapalı. Mevcut dönem bitince hesabın Free plana dönecek.
              </p>
            ) : (
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => void onCancel()}
                disabled={cancelling}
              >
                {cancelling && <Loader2 className="animate-spin" aria-hidden="true" />}
                Aboneliği dönem sonunda iptal et
              </Button>
            )}
          </div>
        )}
      </section>

      {error && (
        <Card className="border-amber-500/30">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Abonelik bilgileri şu anda doğrulanamadı. Güvenlik nedeniyle ücretli plan gösterilmiyor.
            <Button
              variant="ghost"
              size="sm"
              className="ml-1"
              onClick={() => void subscriptionStore.refresh()}
            >
              Tekrar dene
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Planları karşılaştır</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            V1 ödeme altyapısı aylık planları destekler. Yıllık plan seçeneği ödeme altyapısına eklenmeden gösterilmez.
          </p>
        </div>

        {PUBLIC_PLANS.map((plan) => {
          const isCurrent = plan.tier === subscription.tier;
          const backendPlan = plans.find((item) => item.tier === plan.tier);
          const isUpgrade = TIER_ORDER[plan.tier] > TIER_ORDER[subscription.tier];
          const paidTier = plan.tier === "FREE" ? null : (plan.tier as PaidTier);
          const isStarting = checkoutTier === paidTier;

          return (
            <Card
              key={plan.tier}
              className={cn(
                "overflow-hidden",
                isCurrent ? "border-primary ring-1 ring-primary" : "",
              )}
            >
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-bold">{plan.name}</p>
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
                      {plan.tier === "FREE"
                        ? "Ücretsiz"
                        : backendPlan
                          ? formatMoney(backendPlan.priceMinor, backendPlan.currency)
                          : "—"}
                    </p>
                    {plan.tier !== "FREE" && backendPlan && (
                      <p className="text-[11px] text-muted-foreground">/ 30 gün</p>
                    )}
                  </div>
                </div>

                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Mevcut planın
                  </Button>
                ) : paidTier ? (
                  <Button
                    variant={isUpgrade || plan.featured ? "default" : "outline"}
                    className="w-full"
                    disabled={!backendPlan || checkoutTier !== null || loading}
                    onClick={() => void onCheckout(paidTier)}
                  >
                    {isStarting && <Loader2 className="animate-spin" aria-hidden="true" />}
                    {isUpgrade ? `${plan.name} planına geç` : `${plan.name} planını seç`}
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    Ücretsiz plan
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Ödeme güvenliği</h3>
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CreditCard className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold">Kart bilgileri Diewish&apos;te saklanmaz</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Ödeme işlemi güvenli iyzico ödeme akışında tamamlanır. Diewish yalnızca ödeme durumunu ve gerekli işlem referanslarını saklar.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Ödeme geçmişi</h3>
        {payments.length === 0 ? (
          <Card>
            <CardContent className="p-5 text-center text-sm text-muted-foreground">
              Henüz doğrulanmış bir ödeme kaydın yok.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{paymentReference(payment)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatLongDate(new Date(payment.createdAt))} • {payment.provider}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatMoney(payment.amountMinor, payment.currency)}
                    </p>
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        payment.status === "SUCCEEDED"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : payment.status === "FAILED"
                            ? "text-destructive"
                            : "text-muted-foreground",
                      )}
                    >
                      {PAYMENT_STATUS_LABEL[payment.status]}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
