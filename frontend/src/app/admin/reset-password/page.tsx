"use client";

import * as React from "react";
import Link from "next/link";

import { adminClient } from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import { PasswordInput } from "@/presentation/components/ui/password-input";

export default function AdminResetPasswordPage() {
  const [token, setToken] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const actionCode = params.get("oobCode") ?? params.get("token") ?? "";
    setToken(mode && mode !== "resetPassword" ? "" : actionCode);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!token) {
      setMessage("Sıfırlama bağlantısı geçersiz veya süresi dolmuş.");
      return;
    }
    if (password !== confirm) {
      setMessage("Şifreler eşleşmiyor.");
      return;
    }
    setBusy(true);
    try {
      await adminClient.resetPassword(token, password);
      setMessage("Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.");
    } catch {
      setMessage("Sıfırlama bağlantısı geçersiz veya süresi dolmuş.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <section className="w-full max-w-[430px] rounded-[2rem] border bg-card p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-bold">Yeni şifre belirle</h1>
        {message ? <p role="status" className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm">{message}</p> : null}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <PasswordInput aria-label="Yeni şifre" placeholder="Yeni şifre" autoComplete="new-password" value={password} onChange={(e)=>setPassword(e.target.value)} />
          <PasswordInput aria-label="Yeni şifre tekrar" placeholder="Yeni şifre tekrar" autoComplete="new-password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} />
          <Button type="submit" className="w-full" isLoading={busy}>Şifreyi güncelle</Button>
        </form>
        <Link href="/admin/login" className="mt-5 block text-center text-sm font-medium text-primary hover:underline">Girişe dön</Link>
      </section>
    </main>
  );
}
