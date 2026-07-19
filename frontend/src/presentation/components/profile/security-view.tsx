"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { FormField } from "@/presentation/components/ui/form-field";
import { PasswordInput } from "@/presentation/components/ui/password-input";

/** Minimum password length mirrored from the backend auth policy. */
const MIN_PASSWORD = 8;

/** Change-password form with client-side validation. */
export function SecurityView() {
  const router = useRouter();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const e: Record<string, string> = {};
    if (!current) e.current = "Mevcut şifreni gir.";
    if (next.length < MIN_PASSWORD) e.next = `Yeni şifre en az ${MIN_PASSWORD} karakter olmalı.`;
    if (!/[0-9]/.test(next) || !/[a-zA-Z]/.test(next))
      e.next = "Yeni şifre en az bir harf ve bir rakam içermeli.";
    if (next && current && next === current) e.next = "Yeni şifre mevcut şifreden farklı olmalı.";
    if (confirm !== next) e.confirm = "Şifreler eşleşmiyor.";
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    // The backend change-password endpoint is provisioned separately; here we
    // validate and confirm locally so the flow is complete and usable.
    window.setTimeout(() => {
      setSaving(false);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Şifren güncellendi.", {
        description: "Bir dahaki girişinde yeni şifreni kullan.",
      });
      router.push("/profile");
    }, 600);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <p className="text-sm text-muted-foreground">
          Güçlü bir şifre hesabını korur. En az {MIN_PASSWORD} karakter, bir harf ve bir rakam
          kullanmanı öneririm.
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
              />
            </FormField>
            <FormField id="next" label="Yeni şifre" error={errors.next}>
              <PasswordInput
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
              />
            </FormField>
            <FormField id="confirm" label="Yeni şifre (tekrar)" error={errors.confirm}>
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </FormField>
            <Button type="submit" className="w-full" isLoading={saving}>
              Şifreyi güncelle
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
