"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Leaf, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { authService } from "@/application/auth/auth-service";
import { authStore, useAuth } from "@/application/auth/auth-store";
import { consentStore, useConsentState } from "@/application/legal/consent-store";
import type { LegalDocumentType, LegalDocumentView } from "@/domain/legal/types";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { Checkbox } from "@/presentation/components/ui/checkbox";

const ORDER: LegalDocumentType[] = [
  "PRIVACY_POLICY",
  "TERMS_OF_SERVICE",
  "MEDICAL_DISCLAIMER",
  "KVKK_EXPLICIT_CONSENT",
];

const CONSENT_LABEL: Record<LegalDocumentType, string> = {
  PRIVACY_POLICY: "Gizlilik Politikasını okudum ve kişisel verilerin işlenmesi hakkında bilgilendirildim.",
  TERMS_OF_SERVICE: "Kullanım Koşullarını okudum ve kabul ediyorum.",
  MEDICAL_DISCLAIMER:
    "Diewish'in tıbbi teşhis veya tedavi hizmeti sunmadığını ve sağlık profesyonelinin yerini almadığını anladım.",
  KVKK_EXPLICIT_CONSENT:
    "Sağlık verilerimin açık rıza metninde belirtilen amaçlarla işlenmesine özgür irademle açık rıza veriyorum.",
};

export default function ConsentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const consentState = useConsentState();
  const [checked, setChecked] = React.useState<Partial<Record<LegalDocumentType, boolean>>>({});
  const [bodies, setBodies] = React.useState<Partial<Record<LegalDocumentType, LegalDocumentView>>>({});
  const [bodyLoading, setBodyLoading] = React.useState<LegalDocumentType | null>(null);
  const [saving, setSaving] = React.useState(false);

  const items = consentState.consent?.items ?? [];
  const missing = items.filter((item) => item.mandatory && !item.granted).map((item) => item.type);
  const allMissingChecked = missing.length > 0 && missing.every((type) => checked[type] === true);

  React.useEffect(() => {
    if (user?.id && consentState.status === "idle") {
      void consentStore.hydrate(user.id);
    }
  }, [user?.id, consentState.status]);

  async function loadBody(type: LegalDocumentType) {
    if (bodies[type] || bodyLoading === type) return;
    setBodyLoading(type);
    try {
      const document = await consentStore.loadDocument(type);
      setBodies((current) => ({ ...current, [type]: document }));
    } catch {
      toast.error("Yasal metin yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setBodyLoading(null);
    }
  }

  async function submit() {
    if (!user?.id || saving) return;
    if (!allMissingChecked) {
      toast.error("Devam etmek için eksik zorunlu onayları ayrı ayrı işaretleyin.");
      return;
    }

    setSaving(true);
    try {
      await consentStore.grantMany(user.id, missing);
      const current = consentStore.getSnapshot();
      if (current.consent?.allMandatoryGranted) {
        toast.success("Yasal onaylar kaydedildi.");
        router.replace(user.onboardingCompleted ? "/dashboard" : "/onboarding");
      } else {
        toast.error("Bazı onaylar kaydedilemedi. Lütfen eksik olanları tekrar kontrol edin.");
      }
    } catch {
      toast.error("Onaylar kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
      if (user.id) await consentStore.hydrate(user.id, true);
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    const refreshToken = authStore.getRefreshToken();
    if (refreshToken) await authService.logout(refreshToken);
    authStore.clear();
    router.replace("/login");
  }

  if (consentState.status === "loading" || consentState.status === "idle") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" aria-label="Yasal onaylar yükleniyor" />
      </div>
    );
  }

  if (consentState.status === "error") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <ShieldCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
            <h1 className="text-xl font-bold">Yasal onay durumu alınamadı</h1>
            <p className="text-sm text-muted-foreground">{consentState.error}</p>
            <Button className="w-full" onClick={() => user?.id && void consentStore.hydrate(user.id, true)}>
              Tekrar dene
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => void logout()}>
              <LogOut aria-hidden="true" /> Çıkış yap
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (consentState.consent?.allMandatoryGranted) {
    const destination = user?.onboardingCompleted ? "/dashboard" : "/onboarding";
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <ShieldCheck className="mx-auto size-9 text-primary" aria-hidden="true" />
            <div className="space-y-1">
              <h1 className="text-xl font-bold">Güncel onayların kayıtlı</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Güncel zorunlu metinler için onayların mevcut. Sağlık verisi açık rızanı profilindeki
                Gizlilik ve İzinler bölümünden istediğin zaman yönetebilirsin.
              </p>
            </div>
            <Button asChild className="w-full">
              <Link href={destination}>{user?.onboardingCompleted ? "Uygulamaya dön" : "Profilini oluştur"}</Link>
            </Button>
            {user?.onboardingCompleted && (
              <Button asChild variant="outline" className="w-full">
                <Link href="/profile/privacy">Gizlilik ve izinleri yönet</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-center gap-2 font-semibold">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
          <Leaf className="size-5 text-primary" aria-hidden="true" />
        </span>
        Diewish
      </div>

      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Gizlilik ve sağlık verisi onayları</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Sağlık ve beslenme bilgilerini işlemeye başlamadan önce güncel metinleri ayrı ayrı inceleyip
          zorunlu onaylarını vermen gerekiyor. Kutular önceden işaretli değildir. Açık rızanı daha sonra
          geri çekebilirsin; bu durumda rızaya bağlı sağlık özellikleri kullanılamaz.
        </p>
      </div>

      <div className="space-y-4">
        {ORDER.map((type) => {
          const item = items.find((candidate) => candidate.type === type);
          const summary = consentState.documents.find((candidate) => candidate.type === type);
          if (!item || !summary) return null;
          const granted = item.granted;
          const body = bodies[type];

          return (
            <Card key={type} className={type === "KVKK_EXPLICIT_CONSENT" ? "border-primary/30" : undefined}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{summary.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Sürüm {summary.version}</p>
                  </div>
                  {granted && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      Onaylı
                    </span>
                  )}
                </div>

                <details
                  className="rounded-xl border border-border bg-muted/30 p-3"
                  onToggle={(event) => {
                    if (event.currentTarget.open) void loadBody(type);
                  }}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
                    Güncel metni oku
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </summary>
                  <div className="mt-3 max-h-72 overflow-y-auto border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                    {bodyLoading === type && !body ? "Yükleniyor…" : body?.body ?? "Metni açmak için tekrar deneyin."}
                  </div>
                </details>

                <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                  <Checkbox
                    className="mt-0.5"
                    checked={granted || checked[type] === true}
                    disabled={granted}
                    onCheckedChange={(value) =>
                      setChecked((current) => ({ ...current, [type]: value === true }))
                    }
                  />
                  <span>{CONSENT_LABEL[type]}</span>
                </label>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 space-y-3">
        <Button size="lg" className="w-full" disabled={!allMissingChecked || saving} isLoading={saving} onClick={() => void submit()}>
          {saving ? "Onaylar kaydediliyor…" : "Onayla ve Devam Et"}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => void logout()}>
          <LogOut aria-hidden="true" /> Onay vermeden çıkış yap
        </Button>
      </div>
    </main>
  );
}
