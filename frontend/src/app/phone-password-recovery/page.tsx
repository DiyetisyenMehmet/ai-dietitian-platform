"use client";
import * as React from "react";
import Link from "next/link";
import type { CountryCode } from "libphonenumber-js";
import { authStore } from "@/application/auth/auth-store";
import { smsRecoveryClient } from "@/infrastructure/identity/sms-recovery-client";
import { startPhoneVerification } from "@/infrastructure/identity/firebase-browser";
import { formatPhoneInput, normalizePhoneNumber } from "@/infrastructure/identity/phone-number";
import { authErrorMessage } from "@/infrastructure/identity/auth-feedback";
import { ApiError } from "@/infrastructure/api/http-client";
import { AuthLayout } from "@/presentation/components/layout/auth-layout";
import { PhoneCountrySelect } from "@/presentation/components/auth/phone-country-select";
import { Button } from "@/presentation/components/ui/button";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
export default function PhonePasswordRecoveryPage() {
  const [step, setStep] = React.useState<
    "loading" | "disabled" | "number" | "code" | "password" | "success" | "error"
  >("loading");
  const [country, setCountry] = React.useState<CountryCode>("TR"),
    [number, setNumber] = React.useState("");
  const [code, setCode] = React.useState(""),
    [password, setPassword] = React.useState(""),
    [repeat, setRepeat] = React.useState("");
  const [busy, setBusy] = React.useState(false),
    [message, setMessage] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState<string | undefined>();
  const [remaining, setRemaining] = React.useState(0);
  const current = React.useRef<Awaited<ReturnType<typeof startPhoneVerification>> | null>(null);
  const abort = React.useRef<AbortController | null>(null),
    flight = React.useRef(false),
    live = React.useRef(true);
  const clearSms = () => {
    abort.current?.abort();
    current.current?.clear();
    current.current = null;
  };
  React.useEffect(() => {
    live.current = true;
    smsRecoveryClient
      .status()
      .then((status) => {
        if (!live.current) return;
        setStep(
          !status.enabled ? "disabled" : status.pending && status.verified ? "password" : "number",
        );
        setExpiresAt(status.expiresAt);
      })
      .catch(() => {
        if (live.current) setStep("error");
      });
    return () => {
      live.current = false;
      abort.current?.abort();
      current.current?.clear();
    };
  }, []);
  React.useEffect(() => {
    if (!expiresAt || (step !== "code" && step !== "password")) return;
    const tick = () => {
      const n = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000));
      setRemaining(n);
      if (!n) {
        clearSms();
        setPassword("");
        setRepeat("");
        setCode("");
        setStep("number");
        setMessage("Doğrulama süresi doldu. Yeni SMS kodu isteyin.");
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, step]);
  const run = async (work: () => Promise<void>) => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      if (!live.current || abort.current?.signal.aborted) return;
      if (error instanceof ApiError) {
        if (error.code === "SMS_RECOVERY_INVALID") {
          clearSms();
          setStep("number");
          setMessage(
            "Doğrulama geçersiz veya süresi dolmuş. Numaranızı kontrol edip yeni SMS isteyin.",
          );
        } else if (error.status === 429)
          setMessage("Çok fazla deneme yapıldı. Daha sonra tekrar deneyin.");
        else if (error.status === 503) {
          clearSms();
          setStep("disabled");
        } else if (error.status === 422)
          setMessage(
            "Şifreler aynı olmalı; şifre en az 8 karakter, büyük/küçük harf ve rakam içermeli, 72 baytı aşmamalıdır.",
          );
        else setMessage("İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.");
      } else setMessage(authErrorMessage(error));
    } finally {
      flight.current = false;
      if (live.current) setBusy(false);
    }
  };
  const begin = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const n = normalizePhoneNumber(number, country);
      if (!n) {
        setMessage("Geçerli, SMS alabilen bir cep telefonu numarası girin.");
        return;
      }
      clearSms();
      const controller = new AbortController();
      abort.current = controller;
      const result = await smsRecoveryClient.begin(n, controller.signal);
      const sms = await startPhoneVerification(
        n,
        "diewish-recovery-recaptcha",
        undefined,
        true,
        controller.signal,
      );
      if (!live.current || controller.signal.aborted) {
        sms.clear();
        return;
      }
      current.current = sms;
      setNumber(n);
      setExpiresAt(result.expiresAt);
      setStep("code");
      setCode("");
    });
  };
  const verify = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!/^\d{6}$/.test(code) || !current.current) {
        setMessage("Altı haneli SMS kodunu girin.");
        return;
      }
      const supplied = code;
      setCode("");
      const token = await current.current.confirm(supplied);
      await smsRecoveryClient.verify(token, abort.current?.signal);
      if (!live.current || abort.current?.signal.aborted) return;
      current.current?.clear();
      current.current = null;
      setStep("password");
    });
  };
  const complete = (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== repeat) {
      setMessage("Şifreler aynı olmalıdır.");
      return;
    }
    if (
      password.length < 8 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) ||
      new TextEncoder().encode(password).length > 72
    ) {
      setMessage("En az 8 karakter, büyük/küçük harf ve rakam kullanın; 72 baytı aşmayın.");
      return;
    }
    void run(async () => {
      const supplied = password,
        confirmed = repeat;
      setPassword("");
      setRepeat("");
      await smsRecoveryClient.complete(supplied, confirmed);
      if (!live.current) return;
      clearSms();
      authStore.clear();
      setStep("success");
    });
  };
  const restart = () =>
    void run(async () => {
      clearSms();
      await smsRecoveryClient.cancel();
      setCode("");
      setPassword("");
      setRepeat("");
      setExpiresAt(undefined);
      setStep("number");
    });
  return (
    <AuthLayout
      title="Telefonla şifremi sıfırla"
      subtitle="Hesabınıza daha önce bağlanmış ve doğrulanmış telefonunuzu kullanın."
      footer={<Link href="/phone-auth">Telefon ile girişe dön</Link>}
    >
      <p role="status" aria-live="polite" className="mb-4 text-sm">
        {message}
      </p>
      {step === "loading" && <p>Kurtarma seçenekleri yükleniyor...</p>}
      {step === "disabled" && <p>SMS ile şifre kurtarma henüz kullanıma açık değil.</p>}
      {step === "error" && (
        <p role="alert">
          Kurtarma seçenekleri yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin.
        </p>
      )}
      {(step === "number" || step === "code") && (
        <div id="diewish-recovery-recaptcha" className="mb-4 min-h-0" />
      )}
      {step === "number" && (
        <form onSubmit={begin} className="space-y-4">
          <FormField id="recoveryCountry" label="Ülke veya bölge">
            <PhoneCountrySelect
              value={country}
              disabled={busy}
              onChange={(value) => {
                setCountry(value);
                setNumber("");
              }}
            />
          </FormField>
          <FormField id="recoveryPhone" label="Doğrulanmış telefon numaranız">
            <Input
              id="recoveryPhone"
              type="tel"
              autoComplete="tel"
              disabled={busy}
              value={number}
              onChange={(event) => setNumber(formatPhoneInput(event.target.value, country))}
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Bu işlem yeni hesap veya ilk şifre oluşturmaz. Daha önce oluşturduğunuz Diewish
            şifresini sıfırlar.
          </p>
          <Button type="submit" isLoading={busy} className="w-full">
            SMS kodu gönder
          </Button>
        </form>
      )}
      {step === "code" && (
        <form onSubmit={verify} className="space-y-4">
          <FormField id="recoveryCode" label="SMS doğrulama kodu">
            <Input
              id="recoveryCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              disabled={busy}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            />
          </FormField>
          <Button type="submit" isLoading={busy} className="w-full">
            Kodu doğrula
          </Button>
        </form>
      )}
      {step === "password" && (
        <form onSubmit={complete} className="space-y-4">
          <FormField id="recoveryPassword" label="Yeni şifre">
            <Input
              id="recoveryPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              disabled={busy}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
          <FormField id="recoveryRepeat" label="Yeni şifreyi tekrar gir">
            <Input
              id="recoveryRepeat"
              type="password"
              autoComplete="new-password"
              required
              maxLength={128}
              disabled={busy}
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            En az 8 karakter; büyük harf, küçük harf ve rakam kullanın. Mevcut şifrenizden farklı
            olmalıdır.
          </p>
          <Button type="submit" isLoading={busy} className="w-full">
            Şifremi sıfırla
          </Button>
        </form>
      )}
      {(step === "code" || step === "password") && (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            Kalan doğrulama süresi: {remaining} saniye
          </p>
          <Button
            type="button"
            variant="ghost"
            className="mt-3 w-full"
            disabled={busy}
            onClick={restart}
          >
            Numarayı değiştir / Yeniden başlat
          </Button>
        </>
      )}
      {step === "success" && (
        <div className="space-y-4">
          <p>Şifreniz güncellendi. Eski oturumlarınız kapatıldı. Yeni şifrenizle giriş yapın.</p>
          <Link href="/phone-auth" className="block text-primary underline">
            Yeni şifremle giriş yap
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
