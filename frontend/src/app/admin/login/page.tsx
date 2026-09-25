"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { authStore, useAuth } from "@/application/auth/auth-store";
import { adminClient } from "@/infrastructure/admin/admin-client";
import { authClient } from "@/infrastructure/auth/auth-client";
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
    const notice = new URLSearchParams(window.location.search).get("notice");
    if (notice === "access-denied") {
      setFeedback(
        "Bu hesap Yönetim Merkezi için yetkili değil. Farklı bir e-posta veya telefonla tekrar deneyin.",
      );
    }
  }, []);

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
        setFeedback(
          "Bu hesap Yönetim Merkezi için yetkili değil. Farklı bir e-posta veya telefonla tekrar deneyin.",
        );
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
      } catch {
        setFeedback("Giriş bilgileri doğrulanamadı.");
        toast.error("Giriş bilgileri doğrulanamadı.");
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
        const firebaseMessage = authErrorMessage(error);
        const message =
          firebaseMessage === "Kimlik doğrulama sırasında bir hata oluştu. Lütfen tekrar deneyin."
            ? "Management Center erişimi doğrulanamadı."
            : firebaseMessage;
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
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <section className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-7">
          <div className="flex items-center justify-between gap-4">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold tracking-[0.16em] text-amber-700 dark:text-amber-300">
              STAGING
            </span>
          </div>
          <p className="mt-5 text-sm font-semibold text-primary">DIEWISH</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Management Center
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Yalnızca yetkili yönetici hesapları içindir.
          </p>
        </div>

        {feedback ? (
          <p role="status" aria-live="polite" className="mb-4 text-sm text-muted-foreground">
            {feedback}
          </p>
        ) : null}

        {step === "identifier" ? (
          <form onSubmit={continueWithIdentifier} noValidate className="space-y-4">
            <FormField id="adminIdentifier" label="E-posta veya telefon">
              <Input
                id="adminIdentifier"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  setFeedback("");
                }}
                disabled={busy}
              />
            </FormField>

            <Button
              id="diewish-admin-identifier-continue"
              type="submit"
              size="lg"
              className="w-full"
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
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFeedback("");
                }}
                disabled={busy}
              />
            </FormField>

            <Button type="submit" size="lg" className="w-full" isLoading={busy}>
              {busy ? "Giriş yapılıyor..." : "Giriş Yap"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
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

            <Button type="submit" size="lg" className="w-full" isLoading={busy}>
              {busy ? "Doğrulanıyor..." : "Doğrula ve Giriş Yap"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={resetToIdentifier}
            >
              Geri dön
            </Button>
          </form>
        ) : null}

        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
          Yetki kontrolü backend üzerinde güncel ADMIN rolü ve RBAC izinleriyle
          doğrulanır.
        </p>
      </section>
    </main>
  );
}
