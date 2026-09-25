"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { authStore, useAuth } from "@/application/auth/auth-store";
import { adminClient } from "@/infrastructure/admin/admin-client";
import { authClient } from "@/infrastructure/auth/auth-client";
import { ApiError } from "@/infrastructure/api/http-client";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import { PasswordInput } from "@/presentation/components/ui/password-input";

export default function AdminLoginPage() {
  const router = useRouter();
  const { status, user } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
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
    void authClient.logout().catch(() => undefined).finally(() => {
      authStore.clear();
      setEmail("");
      setPassword("");
      setFeedback("");
      recoveringSession.current = false;
    });
  }, [router, status, user]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || inFlight.current) return;
    if (!email.trim() || !password) {
      setFeedback("Giriş bilgilerinizi girin.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFeedback("");
    try {
      const session = await adminClient.loginWithEmail(email.trim().toLowerCase(), password);
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
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-b from-background via-muted/20 to-background p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-primary/[0.04] blur-3xl" aria-hidden="true" />
      <section className="relative w-full max-w-[430px] rounded-[2rem] border border-border/70 bg-card/95 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/10 text-primary shadow-sm">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-[11px] font-bold tracking-[0.2em] text-amber-700 dark:text-amber-300">STAGING</span>
          </div>
          <div className="mt-6">
            <p className="text-xs font-bold tracking-[0.22em] text-primary">DIEWISH</p>
            <h1 className="mt-2 text-[2rem] font-bold leading-tight tracking-[-0.035em]">Management Center</h1>
            <div className="mt-4 h-px w-12 bg-primary/30" aria-hidden="true" />
          </div>
        </div>

        {feedback ? (
          <div role="status" aria-live="polite" className="mb-5 rounded-2xl border border-destructive/15 bg-destructive/[0.04] px-4 py-3 text-sm font-medium text-foreground">
            {feedback}
          </div>
        ) : null}

        <form onSubmit={submit} noValidate className="space-y-4">
          <Input
            id="adminEmail"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-label="Yönetici hesabınız"
            placeholder="Yönetici hesabınız"
            className="h-14 rounded-2xl border-border/80 bg-background/80 px-4 text-base shadow-sm placeholder:text-muted-foreground/65"
            value={email}
            onChange={(event) => { setEmail(event.target.value); setFeedback(""); }}
            disabled={busy}
          />
          <PasswordInput
            id="adminPassword"
            autoComplete="current-password"
            aria-label="Şifreniz"
            placeholder="Şifreniz"
            className="h-14 rounded-2xl"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setFeedback(""); }}
            disabled={busy}
          />
          <div className="flex justify-end">
            <Link href="/admin/forgot-password" className="text-sm font-medium text-primary hover:underline">
              Şifremi unuttum
            </Link>
          </div>
          <Button type="submit" size="lg" className="h-14 w-full rounded-2xl text-base font-semibold shadow-sm" isLoading={busy}>
            {busy ? "Giriş yapılıyor..." : "Giriş Yap"}
          </Button>
        </form>
      </section>
    </main>
  );
}
