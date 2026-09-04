"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, CreditCard, Crown, RotateCcw, Smartphone, Sparkles } from "lucide-react";

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
import type { PaidTier, PaymentDto } from "@/domain/payments/types";
import {
  isAndroidApp,
  isAndroidBillingAvailable,
  isServerVerificationReady,
  loadAndroidBillingCatalog,
  purchaseAndroidTier,
  recurringPrice,
  restoreAndroidPurchases,
  type AndroidBillingCatalog,
} from "@/infrastructure/payments/android-billing-client";

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

/** Account subscription screen backed by the authoritative backend entitlement. */
export function SubscriptionView() {
  const { subscription, payments, loading, error } = useSubscription();
  const [androidHost, setAndroidHost] = React.useState(false);
  const [billingReady, setBillingReady] = React.useState(false);
  const [catalog, setCatalog] = React.useState<AndroidBillingCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = React.useState(false);
  const [purchasingTier, setPurchasingTier] = React.useState<PaidTier | null>(null);
  const [restoring, setRestoring] = React.useState(false);

  const currentPlan = planForTier(subscription.tier);
  const isPaid = subscription.tier !== "FREE";
  const serverReady = isServerVerificationReady(catalog);

  const loadCatalog = React.useCallback(async () => {
    if (!isAndroidApp() || !isAndroidBillingAvailable()) return;
    setCatalogLoading(true);
    try {
      const next = await loadAndroidBillingCatalog();
      setCatalog(next);
    } catch {
      setCatalog(null);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const sync = () => {
      const host = isAndroidApp();
      const ready = isAndroidBillingAvailable();
      setAndroidHost(host);
      setBillingReady(ready);
      if (host && ready) void loadCatalog();
    };
    sync();
    window.addEventListener("diewish:billing-status", sync);
    return () => window.removeEventListener("diewish:billing-status", sync);
  }, [loadCatalog]);

  const purchase = React.useCallback(
    async (tier: PaidTier) => {
      if (!catalog || !catalog.config.serverVerificationReady) {
        toast.error("Google Play sunucu doğrulaması henüz hazır değil.");
        return;
      }
      setPurchasingTier(tier);
      try {
        const outcome = await purchaseAndroidTier(tier, catalog);
        if (outcome.state === "CANCELED") {
          toast.message("Satın alma işlemi iptal edildi.");
          return;
        }
        if (outcome.state === "PENDING") {
          toast.message("Ödeme Google Play'de bekliyor. Tamamlandığında erişimin etkinleşecek.");
          return;
        }
        await subscriptionStore.refresh();
        toast.success("Google Play satın alımın doğrulandı ve erişimin güncellendi.");
      } catch {
        toast.error("Google Play satın alma işlemi doğrulanamadı. Lütfen tekrar deneyin.");
      } finally {
        setPurchasingTier(null);
      }
    },
    [catalog],
  );

  const restore = React.useCallback(async () => {
    setRestoring(true);
    try {
      const verified = await restoreAndroidPurchases();
      await subscriptionStore.refresh();
      toast.success(
        verified.length > 0
          ? "Google Play satın alımların Diewish hesabınla eşitlendi."
          : "Etkin bir Google Play aboneliği bulunamadı.",
      );
    } catch {
      toast.error("Google Play satın alımları şu anda geri yüklenemedi.");
    } finally {
      setRestoring(false);
    }
  }, []);

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
            <p className="text-sm font-semibold">{formatLongDate(new Date(subscription.currentPeriodEnd))}</p>
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
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {!androidHost
                ? "Premium satın alma Android uygulamasından yapılır"
                : !billingReady
                  ? "Google Play bağlantısı hazırlanıyor"
                  : serverReady
                    ? "Google Play satın alma hazır"
                    : "Google Play sunucu doğrulaması hazırlanıyor"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {!androidHost
                ? "Web üzerinden yeni ödeme başlatılmıyor. Premium ve Premium Plus Google Play üzerinden sunulur; aktif erişim aynı Diewish hesabıyla webde de geçerlidir."
                : !billingReady
                  ? "Google Play bağlantısı birkaç saniye içinde hazır olur."
                  : serverReady
                    ? "Fiyatlar Google Play'den doğrulanır. Satın alma sonrası erişim Diewish backend'i tarafından tekrar doğrulanır ve aynı hesabınla webde de geçerli olur."
                    : "Satın alma butonları, Play Console ürünleri ve güvenli sunucu doğrulaması tamamlanana kadar kapalı tutulur."}
            </p>
            {androidHost && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 -ml-2"
                disabled={!billingReady || !serverReady || restoring}
                isLoading={restoring}
                onClick={() => void restore()}
              >
                <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />
                Satın alımları geri yükle
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Planları karşılaştır</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Android uygulamasında güncel fiyat ve dönem bilgisi doğrudan Google Play&apos;den alınır.
          </p>
        </div>

        {PUBLIC_PLANS.map((plan) => {
          const isCurrent = plan.tier === subscription.tier;
          const isFree = plan.tier === "FREE";
          const paidTier = isFree ? null : (plan.tier as PaidTier);
          const productId =
            paidTier === "PREMIUM"
              ? catalog?.config.premiumProductId
              : paidTier === "PREMIUM_PLUS"
                ? catalog?.config.premiumPlusProductId
                : null;
          const product = catalog?.products.find((item) => item.productId === productId);
          const playPrice = recurringPrice(product);

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
                    <p className="text-base font-bold">{isFree ? "Ücretsiz" : playPrice ?? "Google Play"}</p>
                    {!isFree && (
                      <p className="text-[11px] text-muted-foreground">
                        {catalogLoading ? "Fiyat alınıyor…" : playPrice ? "Google Play fiyatı" : "Fiyat uygulamada"}
                      </p>
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
                ) : androidHost ? (
                  <Button
                    className="w-full"
                    variant={plan.featured ? "default" : "outline"}
                    disabled={!billingReady || !serverReady || !product || purchasingTier !== null}
                    isLoading={purchasingTier === paidTier}
                    onClick={() => paidTier && void purchase(paidTier)}
                  >
                    {!serverReady
                      ? "Play Console kurulumu bekleniyor"
                      : product
                        ? `${playPrice ? `${playPrice} · ` : ""}Google Play ile devam et`
                        : "Google Play ürünü hazırlanıyor"}
                  </Button>
                ) : (
                  <Button className="w-full" variant={plan.featured ? "default" : "outline"} disabled>
                    Android uygulamasından satın al
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
                Android satın almaları Google Play ödeme akışında tamamlanır. Diewish yalnızca satın alma
                doğrulaması ve erişim yönetimi için gerekli işlem referanslarını kullanır; kart numarası
                veya CVV saklamaz.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Diewish ödeme kayıtları</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Google Play abonelik ve ödeme geçmişi Google Play hesabından yönetilir.
          </p>
        </div>
        {payments.length === 0 ? (
          <Card>
            <CardContent className="p-5 text-center text-sm text-muted-foreground">
              Diewish tarafında gösterilecek eski bir ödeme kaydı yok.
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
                    <p className="text-sm font-semibold tabular-nums">{formatMoney(payment.amountMinor, payment.currency)}</p>
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
