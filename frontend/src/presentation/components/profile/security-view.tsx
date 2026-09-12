"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Laptop, PauseCircle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

import { authStore } from "@/application/auth/auth-store";
import { changePassword } from "@/infrastructure/account/account-client";
import {
  identityClient,
  type AccountSessionSummary,
} from "@/infrastructure/identity/identity-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { FormField } from "@/presentation/components/ui/form-field";
import { PasswordInput } from "@/presentation/components/ui/password-input";

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

export function SecurityView() {
  const router = useRouter();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [sessions, setSessions] = React.useState<AccountSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = React.useState(true);
  const [revokingSession, setRevokingSession] = React.useState<string | null>(null);
  const [deactivating, setDeactivating] = React.useState(false);

  const loadSessions = React.useCallback(async () => {
    setSessionsLoading(true);
    try {
      setSessions((await identityClient.sessions()).sessions);
    } catch (error) {
      toast.error("Aktif oturumlar yüklenemedi.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

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

  const revokeSession = async (sessionId: string) => {
    setRevokingSession(sessionId);
    try {
      await identityClient.revokeSession(sessionId);
      setSessions((items) => items.filter((item) => item.id !== sessionId));
      toast.success("Oturum kapatıldı.");
    } catch (error) {
      toast.error("Oturum kapatılamadı.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setRevokingSession(null);
    }
  };

  const deactivateAccount = async () => {
    const confirmed = window.confirm(
      "Hesabınızı dondurmak istediğinizden emin misiniz? Tüm aktif oturumlar kapatılacaktır.",
    );
    if (!confirmed) return;

    setDeactivating(true);
    try {
      await identityClient.deactivate();
      authStore.clear();
      toast.success("Hesabınız donduruldu.");
      router.replace("/login");
    } catch (error) {
      toast.error("Hesap dondurulamadı.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDeactivating(false);
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
              <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" disabled={saving} />
            </FormField>
            <FormField id="next" label="Yeni şifre" error={errors.next}>
              <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" disabled={saving} />
            </FormField>
            <FormField id="confirm" label="Yeni şifre (tekrar)" error={errors.confirm}>
              <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" disabled={saving} />
            </FormField>
            <Button type="submit" className="w-full" isLoading={saving} disabled={saving}>
              Şifreyi güncelle
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium">
              <Laptop className="size-5" aria-hidden="true" /> Aktif oturumlar
            </div>
            <Button type="button" variant="ghost" size="sm" disabled={sessionsLoading} onClick={() => void loadSessions()}>
              <RefreshCw className={sessionsLoading ? "animate-spin" : ""} aria-hidden="true" /> Yenile
            </Button>
          </div>

          {!sessionsLoading && sessions.length === 0 && (
            <p className="text-sm text-muted-foreground">Aktif yenileme oturumu bulunamadı.</p>
          )}

          {sessions.map((session) => (
            <div key={session.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{session.userAgent || "Bilinmeyen cihaz"}</p>
                <p className="text-xs text-muted-foreground">
                  {session.ipAddress || "IP bilinmiyor"} · {new Date(session.createdAt).toLocaleString("tr-TR")}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                isLoading={revokingSession === session.id}
                disabled={revokingSession !== null}
                onClick={() => void revokeSession(session.id)}
              >
                <XCircle aria-hidden="true" /> Kapat
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start gap-3">
            <PauseCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">Hesabı dondur</p>
              <p className="text-sm text-muted-foreground">
                Verileriniz silinmez. Tüm oturumlarınız kapatılır; yeniden giriş yaparak hesabınızı tekrar etkinleştirebilirsiniz.
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" className="w-full" isLoading={deactivating} onClick={() => void deactivateAccount()}>
            Hesabımı dondur
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
