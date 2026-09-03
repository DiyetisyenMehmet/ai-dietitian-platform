"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

import { authStore } from "@/application/auth/auth-store";
import { changePassword } from "@/infrastructure/account/account-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { FormField } from "@/presentation/components/ui/form-field";
import { PasswordInput } from "@/presentation/components/ui/password-input";

/** Password policy mirrored from the backend account/auth schemas. */
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

/** Change-password form backed by the real account API. */
export function SecurityView() {
  const router = useRouter();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const e: Record<string, string> = {};
    if (!current) e.current = "Mevcut şifreni gir.";
    if (next.length < MIN_PASSWORD) e.next = `Yeni şifre en az ${MIN_PASSWORD} karakter olmalı.`;
    else if (next.length > MAX_PASSWORD) e.next = `Yeni şifre en fazla ${MAX_PASSWORD} karakter olabilir.`;
    else if (!/[a-z]/.test(next) || !/[A-Z]/.test(next) || !/[0-9]/.test(next))
      e.next = "Yeni şifre en az bir küçük harf, bir büyük harf ve bir rakam içermeli.";
    if (next && current && next === current) e.next = "Yeni şifre mevcut şifreden farklı olmalı.";
    if (confirm !== next) e.confirm = "Şifreler eşleşmiyor.";
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });

      // The backend revokes all refresh tokens after a successful password
      // change. Clear the local access/refresh pair as well so this browser does
      // not appear authenticated until the user signs in with the new password.
      authStore.clear();
      setCurrent("");
      setNext("");
      setConfirm("");
      setErrors({});
      toast.success("Şifren güncellendi.", {
        description: "Güvenlik nedeniyle yeni şifrenle tekrar giriş yapmalısın.",
      });
      router.replace("/login");
    } catch (error) {
      toast.error("Şifre güncellenemedi.", {
        description: error instanceof Error ? error.message : "Lütfen tekrar dene.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <p className="text-sm text-muted-foreground">
          Güçlü bir şifre hesabını korur. En az {MIN_PASSWORD} karakter, bir küçük harf, bir büyük
          harf ve bir rakam kullan.
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField id="current" label="Mevcut şifre" error={errors.current}>
              <PasswordInput
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                disabled={saving}
              />
            </FormField>
            <FormField id="next" label="Yeni şifre" error={errors.next}>
              <PasswordInput
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                disabled={saving}
              />
            </FormField>
            <FormField id="confirm" label="Yeni şifre (tekrar)" error={errors.confirm}>
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                disabled={saving}
              />
            </FormField>
            <Button type="submit" className="w-full" isLoading={saving} disabled={saving}>
              Şifreyi güncelle
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
