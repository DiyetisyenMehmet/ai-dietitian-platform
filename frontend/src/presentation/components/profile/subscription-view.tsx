"use client";

import * as React from "react";
import { Check, CreditCard, Crown, Smartphone, Sparkles } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { formatLongDate } from "@/shared/lib/format";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { PUBLIC_PLANS } from "@/shared/constants/site";
import {
  useSubscription,
  subscriptionStore,
  planForTier,
} from "@/application/payments/subscription-store";
import type { PaymentDto } from "@/domain/payments/types";

const STATUS_LABEL: Record<string, string> = {
  NONE: "Ücretsiz",
  PENDING: "İşlem bekliyor",
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

/**
 * Account subscription screen backed by the authoritative backend entitlement.
 * New paid purchases are intentionally not initiated on the web for launch;
 * Android/Google Play will own purchase and subscription management.
 */
export function SubscriptionView() {
  const { subscription, payments, loading, error } = useSubscription();

  const currentPlan = planForTier(subscription.tier);
  const isPaid = subscription.tier !== "FREE";

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
              <p className="text-xs font-medium text-muted-foreground">Mevcut erişimin</p>
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
            <p className="text-[11px] text-muted-foreground">Mevcut erişim dönemi bitişi</p>
            <p className="text-sm font-semibold">
              {formatLongDate(new Date(subscription.currentPeriodEnd))}
            </p>
          </div>
        )}
      </section>

      {error && (
        <Card className="border-amber-500/30">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Erişim bilgileri şu anda doğrulanamadı. Güvenlik nedeniyle ücretli plan gösterilmiyor.
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => void subscriptionStore.refresh()}>
              Tekrar dene
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Premium satın alma Android uygulamasından yapılacak</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Web üzerinden yeni ödeme başlatılmıyor. Premium ve Premium Plus Google Play üzerinden
              sunulduğunda satın alma, yenileme ve iptal işlemleri Google Play tarafından yönetilecek.
              Aktif Diewish erişimin aynı hesapla webde de geçerli olacak.
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Planları karşılaştır</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Google Play fiyatı ve abonelik dönemi Android uygulamasında ürünler yayına alındığında gösterilecek.
          </p>
        </div>

        {PUBLIC_PLANS.map((plan) => {
          const isCurrent = plan.tier === subscription.tier;
          const isFree = plan.tier === "FREE";

          return (
            <Card key={plan.tier} className={cn("overflow-hidden", isCurrent ? "border-primary ring-1 ring-primary" : "")}>
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
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {isFree
                        ? plan.tagline
                        : plan.tier === "PREMIUM"
                          ? "Daha yüksek yapay zekâ kullanım kotaları ve reklamsız deneyim"
                          : "En yüksek mevcut yapay zekâ kotaları ve reklamsız deneyim"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold">{isFree ? "Ücretsiz" : "Google Play"}</p>
                    {!isFree && <p className="text-[11px] text-muted-foreground">Fiyat uygulamada</p>}
                  </div>
                </div>

                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                  {!isFree && (
                    <li className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="text-muted-foreground">Reklamsız kullanım</span>
                    </li>
                  )}
                </ul>

                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>Mevcut erişimin</Button>
                ) : isFree ? (
                  <Button variant="outline" className="w-full" disabled>Ücretsiz plan</Button>
                ) : (
                  <Button className="w-full" variant={plan.featured ? "default" : "outline"} disabled>
                    Google Play&apos;de yakında
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
              <p className="text-sm font-semibold">Ödeme kartı bilgileri Diewish&apos;te saklanmaz</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Android satın almaları Google Play ödeme akışında tamamlanacak. Diewish backend&apos;i
                yalnızca satın alma doğrulaması ve erişim durumunu yönetmek için gerekli işlem
                referanslarını kullanır; kart numarası veya CVV saklamaz.
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
