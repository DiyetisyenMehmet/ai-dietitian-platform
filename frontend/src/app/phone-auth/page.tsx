"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { authStore } from "@/application/auth/auth-store";
import { identityClient } from "@/infrastructure/identity/identity-client";
import { startPhoneVerification } from "@/infrastructure/identity/firebase-browser";
import { authErrorMessage, normalizeTurkishPhone } from "@/infrastructure/identity/auth-feedback";
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
  const inFlight = React.useRef(false);
  const [feedback, setFeedback] = React.useState("");

  React.useEffect(() => () => confirmation?.clear(), [confirmation]);

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const normalized = normalizeTurkishPhone(phoneNumber);
    if (!normalized) {
      setFeedback("Geçerli bir Türkiye cep telefonu numarası girin. Örnek: 05xx xxx xx xx.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFeedback("Güvenlik doğrulaması yapılıyor, SMS kodu isteniyor...");
    try {
      const next = await startPhoneVerification(normalized, "diewish-phone-recaptcha");
      setPhoneNumber(normalized);
      setConfirmation(next);
      setFeedback("Doğrulama kodu gönderildi. SMS ile gelen altı haneli kodu girin.");
      toast.success("Doğrulama kodu gönderildi.");
    } catch (error) {
      setFeedback(authErrorMessage(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const confirmCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current || !confirmation) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setFeedback("SMS ile gelen altı haneli kodu girin.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFeedback("Kod doğrulanıyor...");
    try {
      const firebaseToken = await confirmation.confirm(code.trim());
      const session = await identityClient.external(firebaseToken);
      authStore.setSession(session);
      confirmation.clear();
      setConfirmation(null);
      router.replace(session.user.onboardingCompleted ? "/dashboard" : "/consent");
    } catch (error) {
      setFeedback(authErrorMessage(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Telefon ile devam et" subtitle="Numaranızı SMS doğrulamasıyla güvenli biçimde onaylayın">
      <div id="diewish-phone-recaptcha" />
      <p role="status" aria-live="polite" className="mb-4 text-sm">{feedback}</p>
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
              placeholder="05xx xxx xx xx"
              disabled={busy}
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Türkiye cep telefonu numaranızı 05xx xxx xx xx veya +905xx xxx xx xx biçiminde yazın. Yeni numaralar doğrulama sonrası hesap oluşturur.
          </p>
          <Button type="submit" className="w-full" isLoading={busy}>
            {busy ? "SMS kodu isteniyor..." : "SMS kodu gönder"}
          </Button>
        </form>
      ) : (
        <form onSubmit={confirmCode} className="space-y-4">
          <FormField id="phoneCode" label="SMS doğrulama kodu">
            <Input
              id="phoneCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              disabled={busy}
            />
          </FormField>
          <Button type="submit" className="w-full" isLoading={busy}>
            {busy ? "Doğrulanıyor..." : "Telefonu doğrula ve devam et"}
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
              setFeedback("");
            }}
          >
            Numarayı değiştir
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
