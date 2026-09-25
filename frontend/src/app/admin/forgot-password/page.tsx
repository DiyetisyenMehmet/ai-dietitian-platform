"use client";

import * as React from "react";
import Link from "next/link";

import { adminClient } from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    try {
      await adminClient.requestPasswordReset(email.trim().toLowerCase());
      setMessage("Hesap uygunsa şifre sıfırlama bağlantısı e-posta adresine gönderildi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <section className="w-full max-w-[430px] rounded-[2rem] border bg-card p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-bold">Şifre sıfırlama</h1>
        <p className="mt-2 text-sm text-muted-foreground">Yönetici e-posta adresini gir.</p>
        {message ? <p role="status" className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm">{message}</p> : null}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Input type="email" inputMode="email" autoComplete="email" aria-label="Yönetici e-postası" placeholder="Yönetici e-postası" value={email} onChange={(e)=>setEmail(e.target.value)} />
          <Button type="submit" className="w-full" isLoading={busy}>Sıfırlama bağlantısı gönder</Button>
        </form>
        <Link href="/admin/login" className="mt-5 block text-center text-sm font-medium text-primary hover:underline">Girişe dön</Link>
      </section>
    </main>
  );
}
