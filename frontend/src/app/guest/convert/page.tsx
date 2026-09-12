"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { authStore, useAuth } from "@/application/auth/auth-store";
import { identityClient } from "@/infrastructure/identity/identity-client";
import { Button } from "@/presentation/components/ui/button";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
import { PasswordInput } from "@/presentation/components/ui/password-input";

export default function ConvertGuestPage() {
  const router = useRouter();
  const auth = useAuth();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      toast.error("Şifreler eşleşmiyor.");
      return;
    }
    setBusy(true);
    try {
      const session = await identityClient.convertGuest({
        email: email.trim().toLowerCase(),
        password,
        fullName: fullName.trim() || undefined,
      });
      authStore.setSession(session);
      toast.success("Misafir hesabınız kalıcı hesaba dönüştürüldü.");
      router.replace("/consent");
    } catch (error) {
      toast.error("Hesap oluşturulamadı.", {
        description: error instanceof Error ? error.message : "Lütfen tekrar deneyin.",
      });
    } finally {
      setBusy(false);
    }
  };

  if (auth.status === "unauthenticated" || (auth.status === "authenticated" && !auth.user?.isGuest)) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-8">
        <div className="w-full space-y-4 text-center">
          <h1 className="text-2xl font-bold">Misafir hesabı bulunamadı</h1>
          <p className="text-sm text-muted-foreground">Bu dönüşüm yalnız aktif misafir oturumunda kullanılabilir.</p>
          <Button type="button" className="w-full" onClick={() => router.replace("/login")}>
            Giriş ekranına dön
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">
      <div className="mb-6 space-y-2 text-center">
        <h1 className="text-2xl font-bold">Misafir hesabını kaydet</h1>
        <p className="text-sm text-muted-foreground">
          Aynı kullanıcı hesabını koruyarak e-posta ve şifre ekleyin. Mevcut izinli verileriniz kaybolmaz.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <FormField id="guest-full-name" label="Ad Soyad">
          <Input id="guest-full-name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </FormField>
        <FormField id="guest-email" label="E-posta">
          <Input id="guest-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField id="guest-password" label="Şifre">
          <PasswordInput id="guest-password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <FormField id="guest-confirm" label="Şifre (tekrar)">
          <PasswordInput id="guest-confirm" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </FormField>
        <Button type="submit" className="w-full" isLoading={busy}>
          Hesabımı kaydet
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => router.back()} disabled={busy}>
          Geri dön
        </Button>
      </form>
    </main>
  );
}
