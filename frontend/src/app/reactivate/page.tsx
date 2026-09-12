"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { authStore } from "@/application/auth/auth-store";
import { identityClient } from "@/infrastructure/identity/identity-client";
import { AuthLayout } from "@/presentation/components/layout/auth-layout";
import { Button } from "@/presentation/components/ui/button";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
import { PasswordInput } from "@/presentation/components/ui/password-input";

export default function ReactivatePage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    try {
      const session = await identityClient.reactivate(email.trim().toLowerCase(), password);
      authStore.setSession(session);
      toast.success("Hesabınız yeniden etkinleştirildi.");
      router.replace(session.user.onboardingCompleted ? "/dashboard" : "/consent");
    } catch (error) {
      toast.error("Hesap yeniden etkinleştirilemedi.", {
        description: error instanceof Error ? error.message : "Bilgilerinizi kontrol edip tekrar deneyin.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Hesabı yeniden etkinleştir"
      subtitle="Dondurduğunuz hesabı kimliğinizi doğrulayarak tekrar açın"
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Giriş ekranına dön
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormField id="reactivate-email" label="E-posta">
          <Input
            id="reactivate-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
        </FormField>
        <FormField id="reactivate-password" label="Şifre">
          <PasswordInput
            id="reactivate-password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
        </FormField>
        <Button type="submit" className="w-full" isLoading={busy}>
          Hesabı yeniden etkinleştir
        </Button>
      </form>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Google, Apple veya telefon ile oluşturulan hesaplar aynı sağlayıcıyla tekrar giriş yaptığında güvenli biçimde yeniden etkinleşir.
      </p>
    </AuthLayout>
  );
}
