"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { adminClient } from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";

export default function AdminBootstrapPage() {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!email.trim()) {
      setFeedback("Yönetici e-posta adresini girin.");
      return;
    }

    setBusy(true);
    setFeedback("");
    try {
      const result = await adminClient.requestFirstSuperAdminBootstrap(
        email.trim().toLowerCase(),
      );
      setFeedback(result.message);
      toast.success("Kurulum bağlantısı gönderildi.");
    } catch {
      setFeedback("Kurulum bağlantısı şu anda gönderilemedi.");
      toast.error("Kurulum bağlantısı gönderilemedi.");
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
          <div role="status" aria-live="polite" className="mt-5 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm">
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
          <Button
            type="submit"
            size="lg"
            className="h-14 w-full rounded-2xl text-base font-semibold"
            isLoading={busy}
          >
            {busy ? "Gönderiliyor..." : "Kurulum bağlantısı gönder"}
          </Button>
        </form>
      </section>
    </main>
  );
}
