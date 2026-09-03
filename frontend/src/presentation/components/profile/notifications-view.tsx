"use client";

import { BellRing, Smartphone } from "lucide-react";

import { Card, CardContent } from "@/presentation/components/ui/card";

/**
 * Notification settings are intentionally read-only until Diewish has a real
 * account-backed preference API and Android push delivery. A local-only toggle
 * would imply that server reminders are controlled when they are not.
 */
export function NotificationsView() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BellRing className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Bildirim tercihleri hazırlanıyor</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Bildirim ayarları henüz kullanıcı hesabına bağlı olarak kaydedilmiyor. Bu nedenle
                çalışmayan veya yalnızca bu cihazda saklanan sahte aç/kapat seçenekleri göstermiyoruz.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Android uygulamasıyla birlikte gerçek push bildirimleri ve hesap bazlı tercihler
              etkinleştirildiğinde; öğün, su, kilo ve haftalık özet hatırlatmaları burada ayrı ayrı
              yönetilebilecek. Tercihler tüm cihazlarda aynı Diewish hesabıyla senkronize olacak.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
