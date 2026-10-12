"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";

import { adminClient } from "@/infrastructure/admin/admin-client";
import { ApiError } from "@/infrastructure/api/http-client";
import { Button } from "@/presentation/components/ui/button";
import { PasswordInput } from "@/presentation/components/ui/password-input";

const INVALID_LINK = "Bu bağlantının süresi dolmuş veya daha önce kullanılmış.";

export default function AdminResetPasswordPage() {
  const token = React.useRef("");
  const inFlight = React.useRef(false);
  const [context, setContext] = React.useState<"invitation" | "reset">("reset");
  const [state, setState] = React.useState<
    "checking" | "ready" | "invalid" | "unavailable" | "success"
  >("checking");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const mode = params.get("mode");
    token.current = params.get("oobCode") ?? params.get("token") ?? token.current;
    // Keep the single-use code in memory only; remove it before navigating anywhere.
    window.history.replaceState(null, "", window.location.pathname);
    if ((mode && mode !== "resetPassword") || !token.current) {
      setState("invalid");
      return;
    }
    void adminClient
      .verifyPasswordReset(token.current)
      .then((result) => {
        if (!alive) return;
        setContext(result.context);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setState(
          error instanceof ApiError && error.code === "ADMIN_RESET_LINK_INVALID"
            ? "invalid"
            : "unavailable",
        );
      });
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current || state !== "ready") return;
    if (password !== confirm) {
      setMessage("Şifreler eşleşmiyor.");
      return;
    }
    if (
      password.length < 12 ||
      password.length > 128 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      setMessage("Şifreniz 12–128 karakter olmalı; harf, rakam ve sembol içermelidir.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await adminClient.resetPassword(token.current, password);
      setContext(result.context);
      token.current = "";
      setPassword("");
      setConfirm("");
      setState("success");
    } catch (error) {
      if (error instanceof ApiError && error.code === "ADMIN_RESET_LINK_INVALID") {
        token.current = "";
        setPassword("");
        setConfirm("");
        setState("invalid");
      } else {
        setMessage(
          "İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin. Sorun sürerse yeni şifre bağlantısı isteyin.",
        );
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const invitation = context === "invitation";
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-gradient-to-b from-background via-muted/20 to-background px-4 py-8">
      <section
        aria-busy={busy || state === "checking"}
        className="relative w-full max-w-[460px] rounded-[2rem] border border-border/70 bg-card/95 p-6 shadow-2xl sm:p-8"
      >
        <div className="mb-7">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/10 text-primary">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <p className="mt-5 text-xs font-bold tracking-[0.22em] text-primary">DIEWISH</p>
          <p className="mt-1 text-lg font-semibold tracking-tight">Management Center</p>
          <div className="mt-4 h-px w-12 bg-primary/30" aria-hidden="true" />
        </div>
        {state === "checking" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Bağlantınız doğrulanıyor…
          </p>
        ) : null}
        {state === "ready" ? (
          <>
            <h1 className="text-2xl font-bold leading-tight tracking-tight">
              {invitation ? "Yönetim Merkezi hesabınızı etkinleştirin" : "Yeni şifre belirle"}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {invitation
                ? "Diewish Management Center hesabınız için güvenli bir şifre belirleyin."
                : "Yönetim Merkezi hesabınız için yeni bir şifre oluşturun."}
            </p>
            <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
              <div className="space-y-2">
                <label htmlFor="admin-new-password" className="text-sm font-medium">
                  Yeni şifre
                </label>
                <PasswordInput
                  id="admin-new-password"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  minLength={12}
                  maxLength={128}
                  className="h-14 rounded-2xl text-base"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setMessage("");
                  }}
                  disabled={busy}
                  aria-describedby="admin-password-policy admin-password-feedback"
                  aria-invalid={Boolean(message)}
                />
                <p
                  id="admin-password-policy"
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  En az 12 karakter; harf, rakam ve sembol içermelidir.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="admin-confirm-password" className="text-sm font-medium">
                  Yeni şifre tekrar
                </label>
                <PasswordInput
                  id="admin-confirm-password"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  maxLength={128}
                  className="h-14 rounded-2xl text-base"
                  value={confirm}
                  onChange={(event) => {
                    setConfirm(event.target.value);
                    setMessage("");
                  }}
                  disabled={busy}
                  aria-describedby="admin-password-feedback"
                  aria-invalid={Boolean(message)}
                />
              </div>
              <div id="admin-password-feedback" role="alert">
                {message ? (
                  <p className="rounded-2xl border border-destructive/15 bg-destructive/[0.04] px-4 py-3 text-sm leading-relaxed">
                    {message}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                className="h-14 w-full rounded-2xl text-base font-semibold"
                isLoading={busy}
                disabled={busy}
              >
                {busy ? "İşlem tamamlanıyor…" : invitation ? "Şifremi belirle" : "Şifremi güncelle"}
              </Button>
            </form>
          </>
        ) : null}
        {state === "success" ? (
          <div role="status">
            <CheckCircle2 className="mb-4 size-9 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold leading-tight">
              {invitation
                ? "Yönetim Merkezi hesabınız etkinleştirildi."
                : "Şifreniz başarıyla güncellendi."}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Yeni şifrenizle Diewish Management Center&apos;a giriş yapabilirsiniz.
            </p>
            <Button
              asChild
              className="mt-6 h-auto min-h-14 w-full whitespace-normal rounded-2xl py-3 text-center"
            >
              <Link href="/admin/login">Yönetim Merkezi&apos;ne giriş yap</Link>
            </Button>
          </div>
        ) : null}
        {state === "invalid" || state === "unavailable" ? (
          <div role="alert">
            <h1 className="text-2xl font-bold leading-tight">
              {state === "invalid" ? INVALID_LINK : "Bağlantınız şu anda doğrulanamıyor."}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {state === "invalid"
                ? "Hesabınız için yeni bir şifre bağlantısı isteyebilirsiniz."
                : "Lütfen daha sonra e-postanızdaki bağlantıyı tekrar açın veya yeni bağlantı isteyin."}
            </p>
            <Button
              asChild
              className="mt-6 h-auto min-h-14 w-full whitespace-normal rounded-2xl py-3 text-center"
            >
              <Link href="/admin/forgot-password">Yeni şifre bağlantısı iste</Link>
            </Button>
          </div>
        ) : null}
        {state !== "success" ? (
          <Link
            href="/admin/login"
            className="mt-6 block rounded-lg text-center text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Giriş ekranına dön
          </Link>
        ) : null}
      </section>
    </main>
  );
}
