"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Info, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/application/auth/auth-store";
import { consentStore, useConsentState } from "@/application/legal/consent-store";
import type { LegalDocumentType, LegalDocumentView } from "@/domain/legal/types";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/presentation/components/ui/modal";

const LABELS: Record<LegalDocumentType, string> = {
  PRIVACY_POLICY: "Gizlilik Politikası",
  TERMS_OF_SERVICE: "Kullanım Koşulları",
  MEDICAL_DISCLAIMER: "Tıbbi Sorumluluk Reddi",
  KVKK_EXPLICIT_CONSENT: "Sağlık verisi açık rızası",
};

export function PrivacyConsentView() {
  const { user } = useAuth();
  const consentState = useConsentState();
  const [healthDocument, setHealthDocument] = React.useState<LegalDocumentView | null>(null);
  const [healthDocumentLoading, setHealthDocumentLoading] = React.useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = React.useState(false);
  const [withdrawing, setWithdrawing] = React.useState(false);

  React.useEffect(() => {
    if (user?.id && (consentState.ownerId !== user.id || consentState.status === "idle")) {
      void consentStore.hydrate(user.id);
    }
  }, [user?.id, consentState.ownerId, consentState.status]);

  React.useEffect(() => {
    if (consentState.status !== "ready" || healthDocument || healthDocumentLoading) return;
    setHealthDocumentLoading(true);
    void consentStore
      .loadDocument("KVKK_EXPLICIT_CONSENT")
      .then(setHealthDocument)
      .catch(() => toast.error("Sağlık verisi açık rıza metni yüklenemedi."))
      .finally(() => setHealthDocumentLoading(false));
  }, [consentState.status, healthDocument, healthDocumentLoading]);

  const healthConsent = consentState.consent?.items.find(
    (item) => item.type === "KVKK_EXPLICIT_CONSENT",
  );

  async function withdrawHealthConsent() {
    if (!user?.id || withdrawing) return;
    setWithdrawing(true);
    try {
      await consentStore.withdraw(user.id, "KVKK_EXPLICIT_CONSENT");
      setWithdrawalOpen(false);
      toast.success("Sağlık verisi açık rızan geri çekildi.", {
        description: "Rızaya bağlı yeni sağlık verisi işleme ve yapay zekâ işlemleri durduruldu.",
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
          <p className="text-sm text-muted-foreground">{consentState.error ?? "Gizlilik ayarları alınamadı."}</p>
          <Button onClick={() => user?.id && void consentStore.hydrate(user.id, true)}>Tekrar dene</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {(consentState.consent?.items ?? []).map((item) => {
            const informational = !item.consentable;
            return (
              <div key={item.type} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{LABELS[item.type]}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Sürüm {item.currentVersion}</p>
                </div>
                {informational ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Info className="size-4" aria-hidden="true" /> Bilgilendirme metni
                  </span>
                ) : (
                  <span className={item.granted ? "inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400" : "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"}>
                    {item.granted ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
                    {item.granted ? "Güncel" : item.mandatory ? "Onay gerekli" : "Aktif değil"}
                  </span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold">Sağlık Verisi Açık Rıza Metni</h2>
            <p className="mt-1 text-xs text-muted-foreground">{healthDocument ? `Sürüm ${healthDocument.version}` : "Güncel metin"}</p>
          </div>

          <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/20 p-4 text-xs leading-relaxed text-muted-foreground">
            {healthDocumentLoading && !healthDocument ? "Yükleniyor…" : healthDocument?.body ?? "Metin yüklenemedi."}
          </div>

          {healthConsent?.granted ? (
            <div className="border-t border-border pt-3">
              <button
                type="button"
                className="text-left text-xs font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
                onClick={() => setWithdrawalOpen(true)}
              >
                Sağlık verisi açık rızamı geri çekmek istiyorum.
              </button>
            </div>
          ) : (
            <div className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              Sağlık verisi açık rızan aktif değil. Sağlık verisi işlemeyi gerektiren özellikleri kullanmak istersen{" "}
              <Link className="font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400" href="/consent">
                açık rıza metnini inceleyip yeniden onaylayabilirsin.
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="outline"><Link href="/privacy">Gizlilik Politikasını aç</Link></Button>
        <Button asChild variant="outline"><Link href="/terms">Kullanım Koşullarını aç</Link></Button>
      </div>

      <Modal open={withdrawalOpen} onOpenChange={(open) => !withdrawing && setWithdrawalOpen(open)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Sağlık verisi açık rızanı geri çekmek istiyor musun?</ModalTitle>
            <ModalDescription className="leading-relaxed">
              Bu işlemden sonra yeni sağlık verisi kaydı, kan tahlili analizi ve rızaya bağlı sağlık kişiselleştirmesi durdurulur. Hesabın ve sağlık verisi işlemeyi gerektirmeyen özellikler çalışmaya devam eder. Mevcut kayıtların bu işlemle otomatik olarak silinmez.
            </ModalDescription>
          </ModalHeader>
          <div className="rounded-xl bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            Devam edersen sağlık verisine dayalı özellikleri yeniden kullanabilmek için tekrar açık rıza vermen gerekir.
          </div>
          <ModalFooter>
            <Button variant="outline" disabled={withdrawing} onClick={() => setWithdrawalOpen(false)}>Vazgeç</Button>
            <Button variant="destructive" disabled={withdrawing} isLoading={withdrawing} onClick={() => void withdrawHealthConsent()}>
              Evet, rızamı geri çek
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
