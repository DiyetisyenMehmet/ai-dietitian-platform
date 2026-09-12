"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { authStore } from "@/application/auth/auth-store";
import { identityClient } from "@/infrastructure/identity/identity-client";
import {
  isExternalAuthConfigured,
  startPhoneVerification,
} from "@/infrastructure/identity/firebase-browser";
import { AuthLayout } from "@/presentation/components/layout/auth-layout";
import { Button } from "@/presentation/components/ui/button";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";

interface PhoneConfirmation {
  confirm(code: string): Promise<string>;
  clear(): void;
}

export default function PhoneAuthPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = React.useState("+90");
  const [code, setCode] = React.useState("");
  const [confirmation, setConfirmation] = React.useState<PhoneConfirmation | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => () => confirmation?.clear(), [confirmation]);

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber.trim())) {
      toast.error("Telefon numarasını ülke koduyla girin. Örnek: +905551112233");
      return;
    }
    setBusy(true);
    try {
      const next = await startPhoneVerification(phoneNumber.trim(), "diewish-phone-recaptcha");
      setConfirmation(next);
      toast.success("Doğrulama kodu gönderildi.");
    } catch (error) {
      toast.error("Doğrulama kodu gönderilemedi.", {
        description: error instanceof Error ? error.message : "Lütfen tekrar deneyin.",
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!confirmation || code.trim().length < 4) return;
    setBusy(true);
    try {
      const firebaseToken = await confirmation.confirm(code.trim());
      const session = await identityClient.external(firebaseToken);
      authStore.setSession(session);
      confirmation.clear();
      setConfirmation(null);
      router.replace(session.user.onboardingCompleted ? "/dashboard" : "/consent");
    } catch (error) {
      toast.error("Telefon doğrulanamadı.", {
        description: error instanceof Error ? error.message : "Kod hatalı veya süresi dolmuş olabilir.",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!isExternalAuthConfigured()) {
    return (
      <AuthLayout title="Telefon ile giriş" subtitle="Kimlik doğrulama servisi henüz yapılandırılmadı">
        <div className="space-y-4 rounded-2xl border border-border p-5 text-center text-sm text-muted-foreground">
          <p>Telefon doğrulaması staging ortamında Firebase Authentication yapılandırıldığında etkinleşir.</p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Giriş ekranına dön</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Telefon ile devam et" subtitle="Numaranızı SMS doğrulamasıyla güvenli biçimde onaylayın">
      <div id="diewish-phone-recaptcha" />
      {!confirmation ? (
        <form onSubmit={requestCode} className="space-y-4">
          <FormField id="phoneNumber" label="Telefon numarası">
            <Input
              id="phoneNumber"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+905551112233"
              disabled={busy}
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Numaranızı ülke koduyla birlikte yazın. Yeni numaralar doğrulama sonrası otomatik hesap oluşturur.
          </p>
          <Button type="submit" className="w-full" isLoading={busy}>
            SMS kodu gönder
          </Button>
        </form>
      ) : (
        <form onSubmit={confirmCode} className="space-y-4">
          <FormField id="phoneCode" label="SMS doğrulama kodu">
            <Input
              id="phoneCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              disabled={busy}
            />
          </FormField>
          <Button type="submit" className="w-full" isLoading={busy}>
            Telefonu doğrula ve devam et
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={() => {
              confirmation.clear();
              setConfirmation(null);
              setCode("");
            }}
          >
            Numarayı değiştir
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
