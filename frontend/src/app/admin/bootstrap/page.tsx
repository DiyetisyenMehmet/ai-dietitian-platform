"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { authStore } from "@/application/auth/auth-store";
import { adminClient } from "@/infrastructure/admin/admin-client";
import { ApiError } from "@/infrastructure/api/http-client";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import { PasswordInput } from "@/presentation/components/ui/password-input";

export default function AdminBootstrapPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [bootstrapCode, setBootstrapCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!email.trim()) {
      setFeedback("Yönetici e-posta adresini girin.");
      return;
    }
    if (password !== confirm) {
      setFeedback("Şifreler eşleşmiyor.");
      return;
    }
    if (password.length < 12) {
      setFeedback("Şifre en az 12 karakter olmalıdır.");
      return;
    }
    if (!bootstrapCode.trim()) {
      setFeedback("Tek kullanımlık kurulum kodunu girin.");
      return;
    }

    setBusy(true);
    setFeedback("");
    try {
      const session = await adminClient.bootstrapFirstSuperAdmin(
        email.trim().toLowerCase(),
        password,
        bootstrapCode.trim(),
      );
      authStore.setSession(session);
      router.replace("/admin");
    } catch (error) {
      const message =
        error instanceof ApiError && error.code === "ADMIN_BOOTSTRAP_CLOSED"
          ? "İlk yönetici kurulumu zaten tamamlandı."
          : error instanceof ApiError && error.code === "ADMIN_BOOTSTRAP_IDENTITY_CONFLICT"
            ? "Bu yönetici e-postası için farklı bir parola kimliği zaten mevcut."
            : "İlk yönetici kurulumu doğrulanamadı.";
      setFeedback(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-b from-background via-muted/20 to-background p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-primary/[0.04] blur-3xl" aria-hidden="true" />
      <section className="relative w-full max-w-[430px] rounded-[2rem] border border-border/70 bg-card/95 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/10 text-primary shadow-sm">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-[11px] font-bold tracking-[0.2em] text-amber-700 dark:text-amber-300">
            STAGING
          </span>
        </div>

        <p className="mt-6 text-xs font-bold tracking-[0.22em] text-primary">DIEWISH</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">İlk Yönetici Kurulumu</h1>

        {feedback ? (
          <div role="status" aria-live="polite" className="mt-5 rounded-2xl border border-destructive/15 bg-destructive/[0.04] px-4 py-3 text-sm">
            {feedback}
          </div>
        ) : null}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Input
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-label="Yönetici e-postası"
            placeholder="Yönetici e-postası"
            className="h-14 rounded-2xl"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFeedback("");
            }}
            disabled={busy}
          />
          <PasswordInput
            aria-label="Yeni yönetici şifresi"
            placeholder="Yeni yönetici şifresi"
            autoComplete="new-password"
            className="h-14 rounded-2xl"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFeedback("");
            }}
            disabled={busy}
          />
          <PasswordInput
            aria-label="Şifre tekrar"
            placeholder="Şifre tekrar"
            autoComplete="new-password"
            className="h-14 rounded-2xl"
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value);
              setFeedback("");
            }}
            disabled={busy}
          />
          <PasswordInput
            aria-label="Tek kullanımlık kurulum kodu"
            placeholder="Tek kullanımlık kurulum kodu"
            autoComplete="off"
            className="h-14 rounded-2xl"
            value={bootstrapCode}
            onChange={(event) => {
              setBootstrapCode(event.target.value);
              setFeedback("");
            }}
            disabled={busy}
          />
          <Button
            type="submit"
            size="lg"
            className="h-14 w-full rounded-2xl text-base font-semibold"
            isLoading={busy}
          >
            Kurulumu tamamla
          </Button>
        </form>
      </section>
    </main>
  );
}
