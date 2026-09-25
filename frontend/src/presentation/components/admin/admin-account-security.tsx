"use client";

import * as React from "react";
import { KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";

import { authStore } from "@/application/auth/auth-store";
import { adminClient } from "@/infrastructure/admin/admin-client";
import { ApiError } from "@/infrastructure/api/http-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/presentation/components/ui/card";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
import { PasswordInput } from "@/presentation/components/ui/password-input";

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "ADMIN_CURRENT_PASSWORD_INVALID") {
      return "Mevcut şifre doğrulanamadı.";
    }
    if (error.code === "ADMIN_EMAIL_IN_USE") {
      return "Bu e-posta başka bir hesap tarafından kullanılıyor.";
    }
    if (error.code === "ADMIN_PASSWORD_REUSE") {
      return "Yeni şifre mevcut şifreden farklı olmalı.";
    }
  }
  return "İşlem tamamlanamadı. Bilgileri kontrol edip tekrar deneyin.";
}

export function AdminAccountSecurity({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = React.useState(initialEmail);
  const [newEmail, setNewEmail] = React.useState("");
  const [emailPassword, setEmailPassword] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [emailBusy, setEmailBusy] = React.useState(false);
  const [passwordBusy, setPasswordBusy] = React.useState(false);

  const changeEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (emailBusy) return;
    setEmailBusy(true);
    try {
      const session = await adminClient.changeEmail({
        currentPassword: emailPassword,
        newEmail,
      });
      authStore.setSession(session);
      setEmail(session.user.email || newEmail.trim().toLowerCase());
      setNewEmail("");
      setEmailPassword("");
      toast.success("Yönetim Merkezi e-postası güncellendi.");
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setEmailBusy(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordBusy) return;
    if (newPassword !== confirmPassword) {
      toast.error("Yeni şifreler eşleşmiyor.");
      return;
    }
    setPasswordBusy(true);
    try {
      const session = await adminClient.changePassword({
        currentPassword,
        newPassword,
      });
      authStore.setSession(session);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Yönetim Merkezi şifresi güncellendi.");
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <section aria-labelledby="admin-account-security-heading" className="space-y-4">
      <div>
        <h2 id="admin-account-security-heading" className="text-lg font-semibold">
          Hesap ve güvenlik
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Yönetim Merkezi giriş e-postanı ve şifreni buradan değiştirebilirsin.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4" aria-hidden="true" />
              E-posta değiştir
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 break-all text-xs text-muted-foreground">
              Mevcut e-posta: <span className="font-medium text-foreground">{email}</span>
            </p>
            <form onSubmit={changeEmail} noValidate className="space-y-3">
              <FormField id="adminNewEmail" label="Yeni e-posta">
                <Input
                  id="adminNewEmail"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  disabled={emailBusy}
                  required
                />
              </FormField>
              <FormField id="adminEmailCurrentPassword" label="Mevcut şifre">
                <PasswordInput
                  id="adminEmailCurrentPassword"
                  autoComplete="current-password"
                  value={emailPassword}
                  onChange={(event) => setEmailPassword(event.target.value)}
                  disabled={emailBusy}
                  required
                />
              </FormField>
              <Button type="submit" className="w-full" isLoading={emailBusy}>
                E-postayı güncelle
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4" aria-hidden="true" />
              Şifre değiştir
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={changePassword} noValidate className="space-y-3">
              <FormField id="adminCurrentPassword" label="Mevcut şifre">
                <PasswordInput
                  id="adminCurrentPassword"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  disabled={passwordBusy}
                  required
                />
              </FormField>
              <FormField id="adminNewPassword" label="Yeni şifre">
                <PasswordInput
                  id="adminNewPassword"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={passwordBusy}
                  required
                />
              </FormField>
              <FormField id="adminConfirmPassword" label="Yeni şifre tekrar">
                <PasswordInput
                  id="adminConfirmPassword"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={passwordBusy}
                  required
                />
              </FormField>
              <p className="text-xs text-muted-foreground">
                En az 12 karakter; harf, rakam ve sembol içermelidir.
              </p>
              <Button type="submit" className="w-full" isLoading={passwordBusy}>
                Şifreyi güncelle
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
