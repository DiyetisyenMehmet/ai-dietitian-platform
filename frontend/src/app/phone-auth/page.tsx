"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PhonePasswordFlow } from "@/presentation/components/auth/phone-password-flow";
import { toast } from "sonner";
import type { CountryCode } from "libphonenumber-js";

import { authStore } from "@/application/auth/auth-store";
import { identityClient } from "@/infrastructure/identity/identity-client";
import { startPhoneVerification } from "@/infrastructure/identity/firebase-browser";
import { authErrorMessage } from "@/infrastructure/identity/auth-feedback";
import { formatPhoneInput, normalizePhoneNumber } from "@/infrastructure/identity/phone-number";
import { PhoneCountrySelect } from "@/presentation/components/auth/phone-country-select";
import { AuthLayout } from "@/presentation/components/layout/auth-layout";
import { Button } from "@/presentation/components/ui/button";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";

interface PhoneConfirmation {
  confirm(code: string): Promise<string>;
  clear(): void;
}

function LegacyPhoneAuthPage() {
  const router = useRouter();
  const [country, setCountry] = React.useState<CountryCode>("TR");
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [code, setCode] = React.useState("");
  const [confirmation, setConfirmation] = React.useState<PhoneConfirmation | null>(null);
  const [busy, setBusy] = React.useState(false);
  const inFlight = React.useRef(false);
  const request = React.useRef<AbortController | null>(null);
  const [feedback, setFeedback] = React.useState("");

  React.useEffect(() => () => request.current?.abort(), []);
  React.useEffect(() => () => confirmation?.clear(), [confirmation]);

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const normalized = normalizePhoneNumber(phoneNumber, country);
    if (!normalized) {
      setFeedback("Seçtiğiniz ülke için geçerli, SMS alabilen bir cep telefonu numarası girin.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFeedback("Güvenlik doğrulaması yapılıyor, SMS kodu isteniyor...");
    request.current?.abort();
    const attempt = new AbortController();
    request.current = attempt;
    try {
      const next = await startPhoneVerification(normalized, "diewish-phone-recaptcha", undefined, false, attempt.signal);
      if (attempt.signal.aborted) { next.clear(); return; }
      setPhoneNumber(normalized);
      setConfirmation(next);
      setFeedback("Doğrulama kodu gönderildi. SMS ile gelen altı haneli kodu girin.");
      toast.success("Doğrulama kodu gönderildi.");
    } catch (error) {
      if (request.current?.signal.aborted) return;
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
      if (request.current?.signal.aborted) return;
      const session = await identityClient.external(firebaseToken);
      if (request.current?.signal.aborted) return;
      authStore.setSession(session);
      confirmation.clear();
      setConfirmation(null);
      router.replace(session.user.onboardingCompleted ? "/dashboard" : "/consent");
    } catch (error) {
      if (request.current?.signal.aborted) return;
      setFeedback(authErrorMessage(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Telefon ile devam et" subtitle="Numaranızı SMS doğrulamasıyla güvenli biçimde onaylayın">
      <p role="status" aria-live="polite" className="mb-4 text-sm">{feedback}</p>
      {!confirmation ? (
        <form onSubmit={requestCode} className="space-y-4">
          <FormField id="phoneCountry" label="Ülke veya bölge">
            <PhoneCountrySelect
              value={country}
              onChange={(nextCountry) => {
                setCountry(nextCountry);
                setPhoneNumber("");
                setFeedback("");
              }}
              disabled={busy}
            />
          </FormField>
          <FormField id="phoneNumber" label="Telefon numarası">
            <Input
              id="phoneNumber"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(formatPhoneInput(event.target.value, country))}
              placeholder={country === "TR" ? "05xx xxx xx xx" : "Telefon numaranız"}
              disabled={busy}
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Türkiye varsayılan ülkedir. Farklı bir ülkedeyseniz yukarıdan ülkenizi seçin. Yeni numaralar yalnız SMS doğrulamasından sonra hesap oluşturur.
          </p>
          <Button id="diewish-phone-request" type="submit" className="w-full" isLoading={busy}>
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
      {/* Keep Google's complete badge visible in the SMS flow, owned by this route. */}
      <div id="diewish-phone-recaptcha" className="mt-4 flex justify-center" />
    </AuthLayout>
  );
}

export default function PhoneAuthPage() {
  const [status, setStatus] = React.useState<Awaited<ReturnType<typeof identityClient.phoneSetupStatus>> | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    identityClient.phoneSetupStatus().then((value) => { if (live) setStatus(value); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  if (failed) return <AuthLayout title="Telefon ile devam et"><p role="alert">Giriş seçenekleri yüklenemedi. Lütfen bağlantınızı kontrol edip sayfayı yenileyin.</p></AuthLayout>;
  if (!status) return <AuthLayout title="Telefon ile devam et"><p role="status">Giriş seçenekleri yükleniyor...</p></AuthLayout>;
  return status.enabled ? <PhonePasswordFlow pending={status.pending} expiresAt={status.expiresAt} /> : <LegacyPhoneAuthPage />;
}
