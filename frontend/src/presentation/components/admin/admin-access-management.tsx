"use client";

import * as React from "react";
import { ShieldCheck, UserRoundCog } from "lucide-react";
import { toast } from "sonner";

import {
  adminClient,
  type AdminManagedUser,
  type AdminRoleDefinition,
} from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/presentation/components/ui/card";
import { Checkbox } from "@/presentation/components/ui/checkbox";
import { Input } from "@/presentation/components/ui/input";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN_STAFF: "Sınırlı Yönetici",
  SUPPORT: "Destek",
  CONTENT_MANAGER: "İçerik Yöneticisi",
  FINANCE: "Finans",
  OPERATIONS: "Operasyon",
};

function roleLabel(role: AdminRoleDefinition | string) {
  if (typeof role === "string") return ROLE_LABELS[role] ?? role;
  return ROLE_LABELS[role.key] ?? role.name;
}

function formatDate(value: string | null) {
  if (!value) return "Henüz giriş yapmadı";
  return new Date(value).toLocaleString("tr-TR");
}

export function AdminAccessManagement({
  currentAdminId,
  canManage,
}: {
  currentAdminId: string;
  canManage: boolean;
}) {
  const [users, setUsers] = React.useState<AdminManagedUser[]>([]);
  const [roles, setRoles] = React.useState<AdminRoleDefinition[]>([]);
  const [draftRoles, setDraftRoles] = React.useState<Record<string, string[]>>({});
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [busyUserId, setBusyUserId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const [staffResult, roleResult] = await Promise.all([
      adminClient.listStaff(),
      adminClient.listRoles(),
    ]);
    setUsers(staffResult.users);
    setRoles(roleResult.roles);
    setDraftRoles(
      Object.fromEntries(staffResult.users.map((user) => [user.id, [...user.roles]])),
    );
  }, []);

  React.useEffect(() => {
    void load().catch(() => toast.error("Yetkili çalışanlar yüklenemedi."));
  }, [load]);

  const toggleRole = (userId: string, roleKey: string, checked: boolean) => {
    setDraftRoles((current) => {
      const next = new Set(current[userId] ?? []);
      if (checked) next.add(roleKey);
      else next.delete(roleKey);
      return { ...current, [userId]: [...next].sort() };
    });
  };

  const saveRoles = async (user: AdminManagedUser) => {
    const reason = (reasons[user.id] ?? "").trim();
    if (reason.length < 3) {
      toast.error("Değişiklik nedeni yazılmalı.");
      return;
    }

    setBusyUserId(user.id);
    try {
      await adminClient.updateStaff(user.id, {
        roleKeys: draftRoles[user.id] ?? [],
        reason,
      });
      setReasons((current) => ({ ...current, [user.id]: "" }));
      await load();
      toast.success("Çalışanın görevleri güncellendi.");
    } catch {
      toast.error("Görev değişikliği uygulanamadı.");
    } finally {
      setBusyUserId(null);
    }
  };

  const toggleActive = async (user: AdminManagedUser) => {
    const reason = (reasons[user.id] ?? "").trim();
    if (reason.length < 3) {
      toast.error("Hesap durumu değişikliği için neden yazılmalı.");
      return;
    }

    setBusyUserId(user.id);
    try {
      await adminClient.updateStaff(user.id, {
        roleKeys: draftRoles[user.id] ?? user.roles,
        isActive: !user.isActive,
        reason,
      });
      setReasons((current) => ({ ...current, [user.id]: "" }));
      await load();
      toast.success(
        user.isActive
          ? "Çalışan hesabı devre dışı bırakıldı."
          : "Çalışan hesabı etkinleştirildi.",
      );
    } catch {
      toast.error("Hesap durumu değiştirilemedi.");
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Access & Security</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Yetkili çalışanlar</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Yönetim merkezine erişebilen çalışanların görevlerini ve hesap durumunu buradan yönetin.
          Yeni çalışan daveti sonraki adımda eklenecektir.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRoundCog className="size-5" aria-hidden="true" />
            Administrators
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Yetkili çalışan bulunmuyor.</p>
          ) : (
            users.map((user) => {
              const isSelf = user.id === currentAdminId;
              const selected = new Set(draftRoles[user.id] ?? user.roles);
              const hasChanges =
                [...selected].sort().join("|") !== [...user.roles].sort().join("|");

              return (
                <section key={user.id} className="rounded-2xl border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold">{user.fullName || user.email}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            user.isActive
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {user.isActive ? "Aktif" : "Devre dışı"}
                        </span>
                        {isSelf ? (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                            Siz
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{user.email}</p>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <span>Son giriş: {formatDate(user.lastLoginAt)}</span>
                        <span>Oluşturulma: {formatDate(user.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {user.roles.length ? (
                        user.roles.map((key) => (
                          <span key={key} className="rounded-full border px-2.5 py-1 text-xs font-medium">
                            {roleLabel(key)}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                          Yetki atanmamış
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {roles.map((role) => (
                      <label
                        key={role.key}
                        className="flex items-start gap-3 rounded-xl border p-3 text-sm"
                      >
                        <Checkbox
                          aria-label={`${user.email} ${roleLabel(role)} görevi`}
                          checked={selected.has(role.key)}
                          disabled={!canManage || isSelf || busyUserId === user.id}
                          onCheckedChange={(checked) =>
                            toggleRole(user.id, role.key, checked === true)
                          }
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">{roleLabel(role)}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {role.description || "Özel yönetici görevi"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Görev atama bilgisi</p>
                    {user.roleAssignments.length ? (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {user.roleAssignments.map((assignment) => (
                          <p key={`${assignment.roleKey}-${assignment.assignedAt}`}>
                            <span className="font-medium text-foreground">
                              {roleLabel(assignment.roleKey)}
                            </span>
                            {" · "}
                            {assignment.assignedByName ||
                              assignment.assignedByEmail ||
                              "Sistem / önceki kayıt"}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Rol atama kaydı yok.</p>
                    )}
                  </div>

                  {canManage && !isSelf ? (
                    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                      <Input
                        aria-label={`${user.email} değişiklik nedeni`}
                        placeholder="Değişiklik nedeni"
                        value={reasons[user.id] ?? ""}
                        onChange={(event) =>
                          setReasons((current) => ({
                            ...current,
                            [user.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!hasChanges || busyUserId === user.id}
                        isLoading={busyUserId === user.id && hasChanges}
                        onClick={() => void saveRoles(user)}
                      >
                        Görevleri Kaydet
                      </Button>
                      <Button
                        type="button"
                        variant={user.isActive ? "destructive" : "default"}
                        disabled={busyUserId === user.id}
                        onClick={() => void toggleActive(user)}
                      >
                        {user.isActive ? "Devre dışı bırak" : "Etkinleştir"}
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      <ShieldCheck className="size-4" aria-hidden="true" />
                      {isSelf
                        ? "Kendi yönetici yetkilerinizi bu ekrandan değiştiremezsiniz."
                        : "Bu hesap için değişiklik yetkiniz yok."}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
