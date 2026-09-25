"use client";

import * as React from "react";
import { ShieldPlus, ScrollText } from "lucide-react";
import { toast } from "sonner";

import {
  adminClient,
  type AdminAuditRecord,
  type AdminManagedUser,
} from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/presentation/components/ui/card";
import { Input } from "@/presentation/components/ui/input";
import { PasswordInput } from "@/presentation/components/ui/password-input";

export function AdminAccessManagement({
  currentAdminId,
  canReadAudit,
}: {
  currentAdminId: string;
  canReadAudit: boolean;
}) {
  const [users, setUsers] = React.useState<AdminManagedUser[]>([]);
  const [events, setEvents] = React.useState<AdminAuditRecord[]>([]);
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [temporaryPassword, setTemporaryPassword] = React.useState("");
  const [accessLevel, setAccessLevel] = React.useState<"LIMITED" | "FULL">("LIMITED");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const access = await adminClient.listAccessUsers();
    setUsers(access.users);
    if (canReadAudit) {
      const audit = await adminClient.getAudit();
      setEvents(audit.events);
    }
  }, [canReadAudit]);

  React.useEffect(() => {
    void load().catch(() => toast.error("Yetkili listesi yüklenemedi."));
  }, [load]);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await adminClient.createAccessUser({
        email: email.trim().toLowerCase(),
        ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
        temporaryPassword,
        accessLevel,
      });
      setEmail("");
      setFullName("");
      setTemporaryPassword("");
      setAccessLevel("LIMITED");
      await load();
      toast.success("Yetkili hesabı oluşturuldu.");
    } catch {
      toast.error("Yetkili hesabı oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const updateAccess = async (
    user: AdminManagedUser,
    next: { accessLevel?: "LIMITED" | "FULL"; isActive?: boolean },
  ) => {
    try {
      await adminClient.updateAccessUser(user.id, {
        accessLevel: next.accessLevel ?? user.accessLevel,
        ...(typeof next.isActive === "boolean" ? { isActive: next.isActive } : {}),
      });
      await load();
      toast.success(
        typeof next.isActive === "boolean"
          ? next.isActive
            ? "Yetkili hesap etkinleştirildi."
            : "Yetkili hesap devre dışı bırakıldı."
          : "Yetki seviyesi güncellendi.",
      );
    } catch {
      toast.error("Yetkili hesabı güncellenemedi.");
    }
  };

  const actionLabel = (action: string) => {
    const labels: Record<string, string> = {
      "admin.bootstrap.super_admin": "İlk Super Admin kurulumu",
      "admin.access.user_create": "Yetkili hesabı oluşturuldu",
      "admin.access.level_change": "Yetki / hesap durumu değiştirildi",
      "admin.security.email_change": "Yönetici e-postası değiştirildi",
      "admin.security.password_change": "Yönetici şifresi değiştirildi",
    };
    return labels[action] ?? action;
  };

  const snapshotText = (value: Record<string, unknown> | null) => {
    if (!value || Object.keys(value).length === 0) return "—";
    return Object.entries(value)
      .map(([key, item]) => {
        const labels: Record<string, string> = {
          email: "E-posta",
          fullName: "Ad",
          accessLevel: "Yetki",
          isActive: "Durum",
          roles: "Roller",
          role: "Rol",
          assignedRole: "Atanan rol",
        };
        const rendered = Array.isArray(item)
          ? item.join(", ")
          : typeof item === "boolean"
            ? item
              ? "Etkin"
              : "Devre dışı"
            : String(item ?? "—");
        return `${labels[key] ?? key}: ${rendered}`;
      })
      .join(" · ");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldPlus className="size-5" aria-hidden="true" />
            Yetkili erişimi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={createUser} className="grid gap-3 md:grid-cols-2">
            <Input aria-label="Yetkili adı" placeholder="Ad Soyad" value={fullName} onChange={(e)=>setFullName(e.target.value)} />
            <Input aria-label="Yetkili e-postası" type="email" placeholder="E-posta" value={email} onChange={(e)=>setEmail(e.target.value)} required />
            <PasswordInput aria-label="Geçici şifre" placeholder="Geçici şifre" value={temporaryPassword} onChange={(e)=>setTemporaryPassword(e.target.value)} required />
            <select
              aria-label="Yetki seviyesi"
              className="h-11 rounded-xl border border-input bg-background px-4 text-sm"
              value={accessLevel}
              onChange={(e)=>setAccessLevel(e.target.value as "LIMITED" | "FULL")}
            >
              <option value="LIMITED">Sınırlı yetki</option>
              <option value="FULL">Tam yetki</option>
            </select>
            <Button type="submit" className="md:col-span-2" isLoading={busy}>Yetkili hesabı oluştur</Button>
          </form>

          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{user.fullName || user.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {user.accessLevel === "FULL" ? "Tam yetki" : "Sınırlı yetki"} · {user.isActive ? "Etkin" : "Devre dışı"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label={`${user.email} yetki seviyesi`}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                    value={user.accessLevel}
                    disabled={user.id === currentAdminId}
                    onChange={(e)=>void updateAccess(user, { accessLevel: e.target.value as "LIMITED" | "FULL" })}
                  >
                    <option value="LIMITED">Sınırlı</option>
                    <option value="FULL">Tam</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={user.id === currentAdminId}
                    onClick={() => void updateAccess(user, { isActive: !user.isActive })}
                  >
                    {user.isActive ? "Devre dışı bırak" : "Etkinleştir"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {canReadAudit ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="size-5" aria-hidden="true" />
              İşlem geçmişi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz yönetici işlemi kaydı yok.</p>
            ) : events.map((event) => (
              <div key={event.id} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{event.actorName || event.actorEmail || event.actorAdminId}</span>
                  <time className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString("tr-TR")}</time>
                </div>
                <p className="mt-1 break-words font-medium">{actionLabel(event.action)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hedef: {event.targetEmail || event.targetId} · Risk: {event.riskLevel}
                </p>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-lg bg-muted/50 px-3 py-2">
                    <span className="font-medium">Önce:</span> {snapshotText(event.beforeState)}
                  </div>
                  <div className="rounded-lg bg-muted/50 px-3 py-2">
                    <span className="font-medium">Sonra:</span> {snapshotText(event.afterState)}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
