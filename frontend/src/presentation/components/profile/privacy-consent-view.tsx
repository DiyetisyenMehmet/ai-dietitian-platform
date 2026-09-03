"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, HeartPulse, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/application/auth/auth-store";
import { consentStore, useConsentState } from "@/application/legal/consent-store";
import type { LegalDocumentType } from "@/domain/legal/types";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";

const LABELS: Record<LegalDocumentType, string> = {
  PRIVACY_POLICY: "Gizlilik Politikası",
  TERMS_OF_SERVICE: "Kullanım Koşulları",
  MEDICAL_DISCLAIMER: "Tıbbi Sorumluluk Reddi",
  KVKK_EXPLICIT_CONSENT: "Sağlık verisi açık rızası",
};

/**
 * Privacy/consent management for established users. Health-data consent can be
 * withdrawn without deleting the account or blocking access to existing data.
 */
export function PrivacyConsentView() {
  const { user } = useAuth();
  const consentState = useConsentState();
  const [confirmingWithdrawal, setConfirmingWithdrawal] = React.useState(false);
  const [withdrawing, setWithdrawing] = React.useState(false);

  React.useEffect(() => {
    if (user?.id && (consentState.ownerId !== user.id || consentState.status === "idle")) {
      void consentStore.hydrate(user.id);
    }
  }, [user?.id, consentState.ownerId, consentState.status]);

  const healthConsent = consentState.consent?.items.find(
    (item) => item.type === "KVKK_EXPLICIT_CONSENT",
  );

  async function withdrawHealthConsent() {
    if (!user?.id || withdrawing) return;
    setWithdrawing(true);
    try {
      await consentStore.withdraw(user.id, "KVKK_EXPLICIT_CONSENT");
      setConfirmingWithdrawal(false);
      toast.success("Sağlık verisi açık rızan geri çekildi.", {
        description: "Yeni sağlık verisi işleme ve rızaya bağlı yapay zekâ işlemleri durduruldu.",
      });
    } catch (error) {
      toast.error("Açık rıza geri çekilemedi.", {
        description: error instanceof Error ? error.message : "Lütfen tekrar deneyin.",
      });
    } finally {
      setWithdrawing(false);
    }
  }

  if (consentState.status === "idle" || consentState.status === "loading") {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" aria-label="Gizlilik ayarları yükleniyor" />
      </div>
    );
  }

  if (consentState.status === "error") {
    return (
      <Card>
        <CardContent className="space-y-4 p-5 text-center">
          <ShieldCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {consentState.error ?? "Gizlilik ayarları alınamadı."}
          </p>
          <Button onClick={() => user?.id && void consentStore.hydrate(user.id, true)}>
            Tekrar dene
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Gizlilik ve izinler senin kontrolünde</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sağlık verisi açık rızanı geri çekebilirsin. Bu işlem mevcut kayıtlarını otomatik olarak
            silmez; onları görüntüleme ve hesabını/verilerini silme hakların devam eder.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {(consentState.consent?.items ?? []).map((item) => (
            <div key={item.type} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{LABELS[item.type]}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sürüm {item.currentVersion}
                </p>
              </div>
              <span
                className={
                  item.granted
                    ? "inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                    : "inline-flex items-center gap-1 text-xs font-medium text-destructive"
                }
              >
                {item.granted ? (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                ) : (
                  <XCircle className="size-4" aria-hidden="true" />
                )}
                {item.granted ? "Güncel" : "Eksik / geri çekildi"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HeartPulse className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Sağlık verisi açık rızası</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Rıza geri çekildiğinde yeni sağlık verisi kaydı, kan tahlili/AI analizi, beslenme planı
                üretimi ve arka plandaki kişisel sağlık koçluğu işlemleri durdurulur.
              </p>
            </div>
          </div>

          {healthConsent?.granted ? (
            confirmingWithdrawal ? (
              <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium">Açık rızanı geri çekmek istediğinden emin misin?</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Mevcut verilerin silinmez. Rızaya bağlı yeni sağlık verisi işleme ve yapay zekâ
                  özellikleri, yeniden açık rıza verene kadar kullanılamaz.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    className="flex-1"
                    isLoading={withdrawing}
                    disabled={withdrawing}
                    onClick={() => void withdrawHealthConsent()}
                  >
                    Rızayı geri çek
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={withdrawing}
                    onClick={() => setConfirmingWithdrawal(false)}
                  >
                    Vazgeç
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setConfirmingWithdrawal(true)}>
                Sağlık verisi açık rızasını geri çek
              </Button>
            )
          ) : (
            <div className="space-y-3">
              <p className="rounded-xl bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                Sağlık verisi açık rızan aktif değil. Rızaya bağlı yeni sağlık ve yapay zekâ işlemleri
                backend tarafından engellenir.
              </p>
              <Button asChild className="w-full">
                <Link href="/consent">Güncel metni incele ve yeniden onayla</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="outline">
          <Link href="/privacy">Gizlilik Politikasını aç</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/terms">Kullanım Koşullarını aç</Link>
        </Button>
      </div>
    </div>
  );
}
