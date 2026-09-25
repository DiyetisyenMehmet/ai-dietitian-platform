"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { authStore } from "@/application/auth/auth-store";
import { adminClient } from "@/infrastructure/admin/admin-client";
import { signInWithGoogle } from "@/infrastructure/identity/firebase-browser";
import { Button } from "@/presentation/components/ui/button";
import { PasswordInput } from "@/presentation/components/ui/password-input";

export default function AdminBootstrapPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setFeedback("Şifreler eşleşmiyor.");
      return;
    }
    if (password.length < 12) {
      setFeedback("Şifre en az 12 karakter olmalıdır.");
      return;
    }
    setBusy(true);
    setFeedback("");
    try {
      const idToken = await signInWithGoogle();
      const session = await adminClient.bootstrapFirstSuperAdmin(idToken, password);
      authStore.setSession(session);
      router.replace("/admin");
    } catch {
      const message = "İlk yönetici kurulumu doğrulanamadı.";
      setFeedback(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-background via-muted/20 to-background p-4">
      <section className="w-full max-w-[430px] rounded-[2rem] border border-border/70 bg-card/95 p-6 shadow-2xl sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-[11px] font-bold tracking-[0.2em] text-amber-700">STAGING</span>
        </div>
        <p className="mt-6 text-xs font-bold tracking-[0.22em] text-primary">DIEWISH</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">İlk Yönetici Kurulumu</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Yalnızca onaylı Diewish sahibi Google hesabı bu tek kullanımlık kurulumu tamamlayabilir.
        </p>
        {feedback ? <div role="status" className="mt-5 rounded-2xl border border-destructive/15 bg-destructive/[0.04] px-4 py-3 text-sm">{feedback}</div> : null}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <PasswordInput aria-label="Yeni yönetici şifresi" placeholder="Yeni yönetici şifresi" autoComplete="new-password" className="h-14 rounded-2xl" value={password} onChange={(e)=>setPassword(e.target.value)} />
          <PasswordInput aria-label="Şifre tekrar" placeholder="Şifre tekrar" autoComplete="new-password" className="h-14 rounded-2xl" value={confirm} onChange={(e)=>setConfirm(e.target.value)} />
          <Button type="submit" size="lg" className="h-14 w-full rounded-2xl text-base font-semibold" isLoading={busy}>
            Google ile doğrula ve kurulumu tamamla
          </Button>
        </form>
      </section>
    </main>
  );
}
