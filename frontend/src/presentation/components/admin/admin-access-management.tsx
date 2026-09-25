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

  const changeAccess = async (id: string, next: "LIMITED" | "FULL") => {
    try {
      await adminClient.updateAccessUser(id, next);
      await load();
      toast.success("Yetki seviyesi güncellendi.");
    } catch {
      toast.error("Yetki seviyesi güncellenemedi.");
    }
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
                    {user.accessLevel === "FULL" ? "Tam yetki" : "Sınırlı yetki"}
                  </p>
                </div>
                <select
                  aria-label={`${user.email} yetki seviyesi`}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  value={user.accessLevel}
                  disabled={user.id === currentAdminId}
                  onChange={(e)=>void changeAccess(user.id, e.target.value as "LIMITED" | "FULL")}
                >
                  <option value="LIMITED">Sınırlı</option>
                  <option value="FULL">Tam</option>
                </select>
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
                <p className="mt-1 break-words">{event.action}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hedef: {event.targetEmail || event.targetId} · Risk: {event.riskLevel}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
