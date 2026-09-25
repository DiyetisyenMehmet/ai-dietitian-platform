"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { authStore, useAuth } from "@/application/auth/auth-store";
import { adminClient } from "@/infrastructure/admin/admin-client";
import { authClient } from "@/infrastructure/auth/auth-client";
import { ApiError } from "@/infrastructure/api/http-client";
import { authErrorMessage } from "@/infrastructure/identity/auth-feedback";
import { startPhoneVerification } from "@/infrastructure/identity/firebase-browser";
import { normalizePhoneNumber } from "@/infrastructure/identity/phone-number";
import { Button } from "@/presentation/components/ui/button";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
import { PasswordInput } from "@/presentation/components/ui/password-input";

type LoginStep = "identifier" | "email-password" | "phone-code";

interface PhoneConfirmation {
  confirm(code: string): Promise<string>;
  clear(): void;
}

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const { status, user } = useAuth();
  const [step, setStep] = React.useState<LoginStep>("identifier");
  const [identifier, setIdentifier] = React.useState("");
  const [resolvedEmail, setResolvedEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [confirmation, setConfirmation] =
    React.useState<PhoneConfirmation | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");
  const inFlight = React.useRef(false);
  const recoveringSession = React.useRef(false);

  React.useEffect(() => {
    if (status !== "authenticated" || !user) return;

    if (user.role === "ADMIN") {
      router.replace("/admin");
      return;
    }

    if (recoveringSession.current) return;
    recoveringSession.current = true;
    void authClient
      .logout()
      .catch(() => undefined)
      .finally(() => {
        authStore.clear();
        setStep("identifier");
        setIdentifier("");
        setResolvedEmail("");
        setPassword("");
        setCode("");
        setFeedback("");
        recoveringSession.current = false;
      });
  }, [router, status, user]);

  React.useEffect(
    () => () => {
      confirmation?.clear();
    },
    [confirmation],
  );

  const resetToIdentifier = React.useCallback(() => {
    confirmation?.clear();
    setConfirmation(null);
    setStep("identifier");
    setPassword("");
    setCode("");
    setFeedback("");
  }, [confirmation]);

  const continueWithIdentifier = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy || inFlight.current) return;

      const email = normalizeEmail(identifier);
      if (email) {
        setResolvedEmail(email);
        setStep("email-password");
        setFeedback("");
        return;
      }

      const phoneNumber = normalizePhoneNumber(identifier, "TR");
      if (!phoneNumber) {
        setFeedback("Geçerli bir e-posta adresi veya SMS alabilen telefon numarası girin.");
        return;
      }

      inFlight.current = true;
      setBusy(true);
      setFeedback("Güvenlik doğrulaması yapılıyor...");
      try {
        const next = await startPhoneVerification(
          phoneNumber,
          "diewish-admin-identifier-continue",
        );
        setIdentifier(phoneNumber);
        setConfirmation(next);
        setStep("phone-code");
        setFeedback("Doğrulama kodu gönderildi.");
      } catch (error) {
        setFeedback(authErrorMessage(error));
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [busy, identifier],
  );

  const submitEmail = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy || inFlight.current) return;
      if (!password) {
        setFeedback("Şifrenizi girin.");
        return;
      }

      inFlight.current = true;
      setBusy(true);
      setFeedback("");
      try {
        const session = await adminClient.loginWithEmail(
          resolvedEmail,
          password,
        );
        authStore.setSession(session);
        router.replace("/admin");
      } catch (error) {
        const message =
          error instanceof ApiError &&
          (error.status === 403 || error.code === "ADMIN_AUTH_FORBIDDEN")
            ? "Bu hesap Yönetim Merkezi için yetkili değil."
            : "Giriş bilgileri doğrulanamadı.";
        setFeedback(message);
        toast.error(message);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [busy, password, resolvedEmail, router],
  );

  const submitPhoneCode = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy || inFlight.current || !confirmation) return;
      if (!/^\d{6}$/.test(code.trim())) {
        setFeedback("SMS ile gelen altı haneli kodu girin.");
        return;
      }

      inFlight.current = true;
      setBusy(true);
      setFeedback("Kod doğrulanıyor...");
      try {
        const firebaseToken = await confirmation.confirm(code.trim());
        const session = await adminClient.loginWithPhone(firebaseToken);
        authStore.setSession(session);
        confirmation.clear();
        setConfirmation(null);
        router.replace("/admin");
      } catch (error) {
        const message =
          error instanceof ApiError &&
          (error.status === 403 || error.code === "ADMIN_AUTH_FORBIDDEN")
            ? "Bu hesap Yönetim Merkezi için yetkili değil."
            : (() => {
                const firebaseMessage = authErrorMessage(error);
                return firebaseMessage ===
                  "Kimlik doğrulama sırasında bir hata oluştu. Lütfen tekrar deneyin."
                  ? "Management Center erişimi doğrulanamadı."
                  : firebaseMessage;
              })();
        setFeedback(message);
        toast.error(message);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [busy, code, confirmation, router],
  );

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-b from-background via-muted/20 to-background p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-primary/[0.04] blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-24 top-1/3 size-56 rounded-full bg-primary/[0.035] blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-24 bottom-1/4 size-64 rounded-full bg-primary/[0.03] blur-3xl" aria-hidden="true" />

      <section className="relative w-full max-w-[430px] rounded-[2rem] border border-border/70 bg-card/95 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/10 text-primary shadow-sm">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-[11px] font-bold tracking-[0.2em] text-amber-700 dark:text-amber-300">
              STAGING
            </span>
          </div>

          <div className="mt-6">
            <p className="text-xs font-bold tracking-[0.22em] text-primary">DIEWISH</p>
            <h1 className="mt-2 text-[2rem] font-bold leading-tight tracking-[-0.035em]">
              Management Center
            </h1>
            <div className="mt-4 h-px w-12 bg-primary/30" aria-hidden="true" />
          </div>
        </div>

        {feedback ? (
          <div
            role="status"
            aria-live="polite"
            className="mb-5 rounded-2xl border border-destructive/15 bg-destructive/[0.04] px-4 py-3 text-sm font-medium text-foreground"
          >
            {feedback}
          </div>
        ) : null}

        {step === "identifier" ? (
          <form onSubmit={continueWithIdentifier} noValidate className="space-y-4">
            <Input
              id="adminIdentifier"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-label="E-posta veya telefon"
              placeholder="Yönetici hesabınız"
              className="h-14 rounded-2xl border-border/80 bg-background/80 px-4 text-base shadow-sm placeholder:text-muted-foreground/65 focus-visible:ring-2"
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                setFeedback("");
              }}
              disabled={busy}
            />

            <Button
              id="diewish-admin-identifier-continue"
              type="submit"
              size="lg"
              className="h-14 w-full rounded-2xl text-base font-semibold shadow-sm"
              isLoading={busy}
            >
              {busy ? "Doğrulanıyor..." : "Devam Et"}
            </Button>
          </form>
        ) : null}

        {step === "email-password" ? (
          <form onSubmit={submitEmail} noValidate className="space-y-4">
            <FormField id="adminPassword" label="Şifre">
              <PasswordInput
                id="adminPassword"
                autoComplete="current-password"
                className="h-14 rounded-2xl"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFeedback("");
                }}
                disabled={busy}
              />
            </FormField>

            <Button type="submit" size="lg" className="h-14 w-full rounded-2xl text-base font-semibold shadow-sm" isLoading={busy}>
              {busy ? "Giriş yapılıyor..." : "Giriş Yap"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full rounded-xl text-muted-foreground"
              disabled={busy}
              onClick={resetToIdentifier}
            >
              Geri dön
            </Button>
          </form>
        ) : null}

        {step === "phone-code" ? (
          <form onSubmit={submitPhoneCode} noValidate className="space-y-4">
            <FormField id="adminPhoneCode" label="SMS doğrulama kodu">
              <Input
                id="adminPhoneCode"
                inputMode="numeric"
                className="h-14 rounded-2xl text-center text-lg tracking-[0.3em]"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, ""));
                  setFeedback("");
                }}
                disabled={busy}
              />
            </FormField>

            <Button type="submit" size="lg" className="h-14 w-full rounded-2xl text-base font-semibold shadow-sm" isLoading={busy}>
              {busy ? "Doğrulanıyor..." : "Doğrula ve Giriş Yap"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full rounded-xl text-muted-foreground"
              disabled={busy}
              onClick={resetToIdentifier}
            >
              Geri dön
            </Button>
          </form>
        ) : null}

      </section>
    </main>
  );
}
