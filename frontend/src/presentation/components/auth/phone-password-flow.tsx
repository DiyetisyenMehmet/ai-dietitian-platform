"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { CountryCode } from "libphonenumber-js";
import { authStore } from "@/application/auth/auth-store";
import type { AuthSession } from "@/domain/auth/types";
import { ApiError } from "@/infrastructure/api/http-client";
import { identityClient } from "@/infrastructure/identity/identity-client";
import { startPhoneVerification } from "@/infrastructure/identity/firebase-browser";
import { authErrorMessage } from "@/infrastructure/identity/auth-feedback";
import { formatPhoneInput, normalizePhoneNumber } from "@/infrastructure/identity/phone-number";
import { PhoneCountrySelect } from "./phone-country-select";
import { AuthLayout } from "../layout/auth-layout";
import { Button } from "../ui/button";
import { FormField } from "../ui/form-field";
import { Input } from "../ui/input";

type Mode = "login" | "register" | "legacy";
export function PhonePasswordFlow({
  pending,
  expiresAt: initialExpiry,
}: {
  pending: boolean;
  expiresAt?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("login");
  const [step, setStep] = React.useState<"number" | "code" | "password">(
    pending ? "password" : "number",
  );
  const [country, setCountry] = React.useState<CountryCode>("TR");
  const [number, setNumber] = React.useState("");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [repeat, setRepeat] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState(initialExpiry);
  const [remaining, setRemaining] = React.useState(0);
  const confirmation = React.useRef<Awaited<ReturnType<typeof startPhoneVerification>> | null>(
    null,
  );
  const flight = React.useRef(false);
  const live = React.useRef(true);
  React.useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      confirmation.current?.clear();
    };
  }, []);
  React.useEffect(() => {
    if (!expiresAt || step !== "password") return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) {
        setPassword("");
        setRepeat("");
        setStep("number");
        setMode("register");
        setFeedback("Doğrulama süresi doldu. Yeniden SMS kodu isteyin.");
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, step]);
  const finish = (session: AuthSession) => {
    if (!live.current) return;
    setPassword("");
    setRepeat("");
    setCode("");
    authStore.setSession(session);
    router.replace(session.user.onboardingCompleted ? "/dashboard" : "/consent");
  };
  const run = async (work: () => Promise<void>) => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setFeedback("");
    try {
      await work();
    } catch (error) {
      if (!live.current) return;
      if (error instanceof ApiError && error.code === "PHONE_PASSWORD_REQUIRED") {
        setMode("login");
        setStep("number");
        setPassword("");
        setRepeat("");
        setFeedback(
          "Bu hesap için şifre oluşturulmuş. Telefon numaranız ve Diewish şifrenizle giriş yapın.",
        );
      } else if (error instanceof ApiError && error.code === "PHONE_SETUP_INVALID") {
        setStep("number");
        setMode("register");
        setPassword("");
        setRepeat("");
        setFeedback("Doğrulama geçersiz veya süresi dolmuş. Yeniden SMS kodu isteyin.");
      } else if (error instanceof ApiError && error.code === "ACCOUNT_OWNERSHIP_REQUIRED") {
        setFeedback(
          "Bu numara mevcut bir hesaba ait. Hesabınızın mevcut giriş yöntemini kullanın.",
        );
      } else if (error instanceof ApiError && error.status === 401) {
        setFeedback("Telefon numarası veya şifre hatalı.");
      } else if (error instanceof ApiError && error.status === 429) {
        setFeedback("Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.");
      } else {
        setFeedback(authErrorMessage(error));
      }
    } finally {
      flight.current = false;
      if (live.current) setBusy(false);
    }
  };
  const numberSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const normalized = normalizePhoneNumber(number, country);
      if (!normalized) {
        setFeedback("Geçerli, SMS alabilen bir cep telefonu numarası girin.");
        return;
      }
      if (mode === "login") {
        const supplied = password;
        setPassword("");
        finish(await identityClient.phonePasswordLogin(normalized, supplied));
      } else {
        confirmation.current?.clear();
        const next = await startPhoneVerification(
          normalized,
          "diewish-phone-password-request",
          undefined,
          true,
        );
        if (!live.current) {
          next.clear();
          return;
        }
        confirmation.current = next;
        setNumber(normalized);
        setCode("");
        setStep("code");
        setFeedback("SMS ile gelen altı haneli kodu girin.");
      }
    });
  };
  const codeSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!/^\d{6}$/.test(code) || !confirmation.current) {
        setFeedback("Altı haneli SMS kodunu girin.");
        return;
      }
      const typedCode = code;
      setCode("");
      const idToken = await confirmation.current.confirm(typedCode);
      if (mode === "legacy") {
        finish(await identityClient.external(idToken));
        return;
      }
      let result;
      try {
        result = await identityClient.phoneSetupStart(number, idToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "PHONE_LEGACY_SESSION_REQUIRED")
          throw error;
        // Unknown legacy password provenance: prove access to the SAME existing
        // account. Keep this temporary access token in this call's memory only.
        const oldSession = await identityClient.external(idToken);
        result = await identityClient.phoneSetupStart(
          number,
          idToken,
          oldSession.tokens.accessToken,
        );
      }
      confirmation.current.clear();
      confirmation.current = null;
      setPassword("");
      setRepeat("");
      setExpiresAt(result.expiresAt);
      setStep("password");
      setFeedback("Telefon doğrulandı. Diewish şifrenizi oluşturun.");
    });
  };
  const passwordSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== repeat) {
      setFeedback("Şifreler aynı olmalıdır.");
      return;
    }
    if (
      password.length < 8 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) ||
      new TextEncoder().encode(password).length > 72
    ) {
      setFeedback(
        "Şifreniz en az 8 karakter, büyük harf, küçük harf ve rakam içermeli; 72 baytı aşmamalıdır.",
      );
      return;
    }
    void run(async () => {
      const supplied = password,
        confirmed = repeat;
      setPassword("");
      setRepeat("");
      finish(await identityClient.phoneSetupComplete(supplied, confirmed));
    });
  };
  const changeMode = (next: Mode) =>
    void run(async () => {
      if (step === "password") await identityClient.phoneSetupCancel();
      confirmation.current?.clear();
      confirmation.current = null;
      setMode(next);
      setStep("number");
      setCode("");
      setPassword("");
      setRepeat("");
      setExpiresAt(undefined);
    });
  return (
    <AuthLayout
      title={
        step === "password"
          ? "Diewish şifrenizi oluşturun"
          : mode === "login"
            ? "Telefon ile giriş yap"
            : mode === "legacy"
              ? "Eski SMS hesabına eriş"
              : "Telefon ile kayıt ol"
      }
      subtitle={
        step === "password"
          ? "Bu şifre sonraki normal girişlerinizde kullanılacak."
          : mode === "login"
            ? "Telefon numaranız ve Diewish şifrenizle giriş yapın."
            : "Önce telefon numaranızı SMS koduyla doğrulayın."
      }
    >
      <p role="status" aria-live="polite" className="mb-4 text-sm">
        {feedback}
      </p>
      {step === "number" && (
        <form onSubmit={numberSubmit} className="space-y-4">
          <FormField id="phoneCountry" label="Ülke veya bölge">
            <PhoneCountrySelect
              value={country}
              disabled={busy}
              onChange={(value) => {
                setCountry(value);
                setNumber("");
              }}
            />
          </FormField>
          <FormField id="phoneNumber" label="Telefon numarası">
            <Input
              id="phoneNumber"
              type="tel"
              autoComplete="tel"
              value={number}
              disabled={busy}
              onChange={(event) => setNumber(formatPhoneInput(event.target.value, country))}
            />
          </FormField>
          {mode === "login" && (
            <FormField id="phonePassword" label="Diewish şifreniz">
              <Input
                id="phonePassword"
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={busy}
                required
                maxLength={128}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>
          )}
          <Button
            id="diewish-phone-password-request"
            type="submit"
            className="w-full"
            isLoading={busy}
          >
            {mode === "login" ? "Giriş yap" : "SMS kodu gönder"}
          </Button>
          {mode === "legacy" && (
            <p className="text-xs text-muted-foreground">
              Bu geçiş yalnız daha önce SMS ile açılmış, henüz Diewish şifresi olmayan hesaplar
              içindir. Şifre oluşturmak için “Telefon ile kayıt ol / İlk şifremi oluştur” seçeneğini
              kullanın.
            </p>
          )}
        </form>
      )}
      {step === "code" && (
        <form onSubmit={codeSubmit} className="space-y-4">
          <FormField id="phoneCode" label="SMS doğrulama kodu">
            <Input
              id="phoneCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              disabled={busy}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            />
          </FormField>
          <Button type="submit" className="w-full" isLoading={busy}>
            Telefonu doğrula
          </Button>
        </form>
      )}
      {step === "password" && (
        <form onSubmit={passwordSubmit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Doğrulama süresi: {remaining} saniye. Süre dolmadan bu cihazda devam edebilirsiniz.
            Hesap, şifreniz kaydedildiğinde oluşturulur.
          </p>
          <FormField id="newPhonePassword" label="Şifre oluştur">
            <Input
              id="newPhonePassword"
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
          <FormField id="repeatPhonePassword" label="Şifreyi tekrar gir">
            <Input
              id="repeatPhonePassword"
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
            En az 8 karakter; büyük harf, küçük harf ve rakam kullanın.
          </p>
          <Button type="submit" className="w-full" isLoading={busy}>
            Şifremi kaydet ve devam et
          </Button>
        </form>
      )}
      <div className="mt-4 flex flex-col gap-2">
        {mode !== "login" || step !== "number" ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => changeMode("login")}>
            Telefon ve şifre ile giriş yap
          </Button>
        ) : null}
        {step !== "password" && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => changeMode("register")}
          >
            Telefon ile kayıt ol / İlk şifremi oluştur
          </Button>
        )}
        {step === "number" && mode !== "legacy" && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => changeMode("legacy")}
          >
            Eski SMS hesabıma eriş
          </Button>
        )}
        {step === "code" && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => changeMode(mode)}>
            Numarayı değiştir / Yeniden kod iste
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
