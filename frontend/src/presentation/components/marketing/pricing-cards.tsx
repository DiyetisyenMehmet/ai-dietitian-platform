"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Smartphone } from "lucide-react";

import { PUBLIC_PLANS } from "@/shared/constants/site";
import { Button } from "@/presentation/components/ui/button";
import { cn } from "@/shared/lib/utils";

const PAID_COPY = {
  PREMIUM: {
    tagline: "Daha yüksek yapay zekâ kullanım kotaları ve reklamsız deneyim",
  },
  PREMIUM_PLUS: {
    tagline: "En yüksek mevcut yapay zekâ kotaları ve reklamsız deneyim",
  },
} as const;

/**
 * Public plan comparison. Web checkout is intentionally disabled for the first
 * release: paid access will be purchased in the Android app through Google Play
 * and the resulting backend entitlement will also apply on the web.
 */
export function PricingCards() {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <div className="mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold">Premium satın alma Android uygulamasından yapılacak</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Web üzerinden ödeme şu anda kapalıdır. Premium ve Premium Plus, Google Play üzerinden
            sunulduğunda satın alınabilecek; aktif erişim aynı Diewish hesabıyla webde de geçerli olacaktır.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {PUBLIC_PLANS.map((plan) => {
          const isFree = plan.tier === "FREE";
          const paidCopy = plan.tier === "PREMIUM" || plan.tier === "PREMIUM_PLUS"
            ? PAID_COPY[plan.tier]
            : null;

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
                <p className="text-sm text-muted-foreground">
                  {isFree ? plan.tagline : paidCopy?.tagline}
                </p>
              </div>

              <div className="mt-6">
                {isFree ? (
                  <>
                    <p className="text-4xl font-bold tracking-tight">0 ₺</p>
                    <p className="mt-1 text-xs text-muted-foreground">Süresiz ücretsiz</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold tracking-tight">Google Play</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Fiyat ve abonelik dönemi uygulamada gösterilecek
                    </p>
                  </>
                )}
              </div>

              <Button
                className="mt-6 w-full"
                variant={plan.featured ? "default" : "outline"}
                disabled={!isFree}
                onClick={() => isFree && router.push("/register")}
              >
                {isFree ? "Ücretsiz Başla" : "Google Play'de yakında"}
              </Button>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
                {!isFree && (
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-muted-foreground">Free kullanıcı reklamlarından arındırılmış deneyim</span>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Google Play aboneliği etkinleştirildiğinde ödeme ve abonelik yönetimi Google Play üzerinden yapılır.
        Diewish, Google Play ödeme kartı bilgilerini kendi sunucularında saklamaz.
      </p>
    </div>
  );
}
