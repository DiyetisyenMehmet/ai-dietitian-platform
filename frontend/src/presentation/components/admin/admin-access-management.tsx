"use client";

import * as React from "react";
import {
  KeyRound,
  MailPlus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundCog,
} from "lucide-react";
import { toast } from "sonner";

import {
  adminClient,
  type AdminInvitation,
  type AdminManagedUser,
  type AdminPermissionDefinition,
  type AdminRoleDefinition,
  type AdminStaffSession,
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

function inviteStatus(invitation: AdminInvitation) {
  if (invitation.acceptedAt) return "Kabul edildi";
  if (invitation.revokedAt) return "İptal edildi";
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return "Süresi doldu";
  return "Bekliyor";
}

export function AdminAccessManagement({
  currentAdminId,
  canManageStaff,
  canManageRoles,
}: {
  currentAdminId: string;
  canManageStaff: boolean;
  canManageRoles: boolean;
}) {
  const [users, setUsers] = React.useState<AdminManagedUser[]>([]);
  const [roles, setRoles] = React.useState<AdminRoleDefinition[]>([]);
  const [permissions, setPermissions] = React.useState<AdminPermissionDefinition[]>([]);
  const [invitations, setInvitations] = React.useState<AdminInvitation[]>([]);
  const [draftRoles, setDraftRoles] = React.useState<Record<string, string[]>>({});
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [sessions, setSessions] = React.useState<Record<string, AdminStaffSession[]>>({});
  const [openSessions, setOpenSessions] = React.useState<Record<string, boolean>>({});
  const [busyUserId, setBusyUserId] = React.useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteName, setInviteName] = React.useState("");
  const [inviteRoles, setInviteRoles] = React.useState<string[]>([]);
  const [inviteReason, setInviteReason] = React.useState("");
  const [inviteBusy, setInviteBusy] = React.useState(false);

  const [editingRoleKey, setEditingRoleKey] = React.useState<string | null>(null);
  const [roleName, setRoleName] = React.useState("");
  const [roleDescription, setRoleDescription] = React.useState("");
  const [rolePermissions, setRolePermissions] = React.useState<string[]>(["admin.access"]);
  const [roleReason, setRoleReason] = React.useState("");
  const [roleBusy, setRoleBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const [staffResult, roleResult, permissionResult, invitationResult] = await Promise.all([
      adminClient.listStaff(),
      adminClient.listRoles(),
      adminClient.listPermissions(),
      adminClient.listInvitations(),
    ]);
    setUsers(staffResult.users);
    setRoles(roleResult.roles);
    setPermissions(permissionResult.permissions);
    setInvitations(invitationResult.invitations);
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
    const roleKeys = draftRoles[user.id] ?? [];
    if (roleKeys.length === 0) {
      toast.error("En az bir görev seçilmeli.");
      return;
    }

    setBusyUserId(user.id);
    try {
      await adminClient.updateStaff(user.id, { roleKeys, reason });
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

  const sendInvitation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageStaff || inviteBusy) return;
    if (inviteRoles.length === 0) {
      toast.error("Davet için en az bir görev seçilmeli.");
      return;
    }
    if (inviteReason.trim().length < 3) {
      toast.error("Davet nedeni yazılmalı.");
      return;
    }

    setInviteBusy(true);
    try {
      await adminClient.inviteStaff({
        email: inviteEmail.trim().toLowerCase(),
        ...(inviteName.trim() ? { fullName: inviteName.trim() } : {}),
        roleKeys: inviteRoles,
        reason: inviteReason.trim(),
      });
      setInviteEmail("");
      setInviteName("");
      setInviteRoles([]);
      setInviteReason("");
      await load();
      toast.success("Çalışan daveti gönderildi.");
    } catch {
      toast.error("Çalışan daveti gönderilemedi.");
    } finally {
      setInviteBusy(false);
    }
  };

  const loadSessions = async (userId: string) => {
    const isOpening = !openSessions[userId];
    setOpenSessions((current) => ({ ...current, [userId]: isOpening }));
    if (!isOpening) return;
    try {
      const result = await adminClient.listStaffSessions(userId);
      setSessions((current) => ({ ...current, [userId]: result.sessions }));
    } catch {
      toast.error("Oturumlar yüklenemedi.");
    }
  };

  const revokeOneSession = async (user: AdminManagedUser, sessionId: string) => {
    const reason = (reasons[user.id] ?? "").trim();
    if (reason.length < 3) {
      toast.error("Oturum kapatma nedeni yazılmalı.");
      return;
    }
    setBusyUserId(user.id);
    try {
      await adminClient.revokeStaffSession(user.id, sessionId, reason);
      const result = await adminClient.listStaffSessions(user.id);
      setSessions((current) => ({ ...current, [user.id]: result.sessions }));
      toast.success("Oturum kapatıldı.");
    } catch {
      toast.error("Oturum kapatılamadı.");
    } finally {
      setBusyUserId(null);
    }
  };

  const revokeAllSessions = async (user: AdminManagedUser) => {
    const reason = (reasons[user.id] ?? "").trim();
    if (reason.length < 3) {
      toast.error("Oturum kapatma nedeni yazılmalı.");
      return;
    }
    setBusyUserId(user.id);
    try {
      await adminClient.revokeAllStaffSessions(user.id, reason);
      const result = await adminClient.listStaffSessions(user.id);
      setSessions((current) => ({ ...current, [user.id]: result.sessions }));
      toast.success("Tüm aktif oturumlar kapatıldı.");
    } catch {
      toast.error("Oturumlar kapatılamadı.");
    } finally {
      setBusyUserId(null);
    }
  };

  const startRoleEdit = (role: AdminRoleDefinition) => {
    setEditingRoleKey(role.key);
    setRoleName(role.name);
    setRoleDescription(role.description ?? "");
    setRolePermissions([...new Set(["admin.access", ...role.permissions])]);
    setRoleReason("");
  };

  const resetRoleEditor = () => {
    setEditingRoleKey(null);
    setRoleName("");
    setRoleDescription("");
    setRolePermissions(["admin.access"]);
    setRoleReason("");
  };

  const saveCustomRole = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageRoles || roleBusy) return;
    if (roleReason.trim().length < 3) {
      toast.error("Görev değişikliği nedeni yazılmalı.");
      return;
    }

    setRoleBusy(true);
    try {
      const payload = {
        name: roleName.trim(),
        ...(roleDescription.trim() ? { description: roleDescription.trim() } : {}),
        permissionKeys: rolePermissions,
        reason: roleReason.trim(),
      };
      if (editingRoleKey) {
        await adminClient.updateRole(editingRoleKey, payload);
        toast.success("Özel görev güncellendi.");
      } else {
        await adminClient.createRole(payload);
        toast.success("Özel görev oluşturuldu.");
      }
      resetRoleEditor();
      await load();
    } catch {
      toast.error("Özel görev kaydedilemedi.");
    } finally {
      setRoleBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Access & Security</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Yetkili çalışanlar</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Yönetim merkezine erişebilen çalışanları, görevlerini ve aktif oturumlarını buradan yönetin.
        </p>
      </div>

      {canManageStaff ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailPlus className="size-5" aria-hidden="true" />
              Yeni çalışan davet et
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={sendInvitation}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  aria-label="Davet edilen çalışan adı"
                  placeholder="Ad Soyad"
                  value={inviteName}
                  onChange={(event) => setInviteName(event.target.value)}
                />
                <Input
                  aria-label="Davet edilen çalışan e-postası"
                  type="email"
                  placeholder="E-posta"
                  required
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {roles.map((role) => {
                  const checked = inviteRoles.includes(role.key);
                  return (
                    <label key={role.key} className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          setInviteRoles((current) =>
                            value === true
                              ? [...new Set([...current, role.key])]
                              : current.filter((key) => key !== role.key),
                          )
                        }
                      />
                      <span>
                        <span className="block font-medium">{roleLabel(role)}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {role.description || "Özel yönetici görevi"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <Input
                aria-label="Davet nedeni"
                placeholder="Davet nedeni"
                value={inviteReason}
                onChange={(event) => setInviteReason(event.target.value)}
              />
              <Button type="submit" isLoading={inviteBusy}>
                Güvenli davet gönder
              </Button>
            </form>

            {invitations.length ? (
              <div className="mt-6 space-y-2">
                <p className="text-sm font-semibold">Son davetler</p>
                {invitations.slice(0, 8).map((invitation) => (
                  <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {invitation.fullName || invitation.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{invitation.email}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">{inviteStatus(invitation)}</p>
                      <p>{formatDate(invitation.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
              const userSessions = sessions[user.id] ?? [];
              const activeSessionCount = userSessions.filter((session) => session.isActive).length;

              return (
                <section key={user.id} className="rounded-2xl border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold">{user.fullName || user.email}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.isActive
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}>
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
                      <label key={role.key} className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                        <Checkbox
                          aria-label={`${user.email} ${roleLabel(role)} görevi`}
                          checked={selected.has(role.key)}
                          disabled={!canManageStaff || isSelf || busyUserId === user.id}
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
                            <span className="font-medium text-foreground">{roleLabel(assignment.roleKey)}</span>
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

                  <div className="mt-4">
                    <Button type="button" variant="ghost" size="sm" onClick={() => void loadSessions(user.id)}>
                      <KeyRound className="mr-2 size-4" aria-hidden="true" />
                      {openSessions[user.id] ? "Oturumları gizle" : "Oturumları göster"}
                    </Button>
                  </div>

                  {openSessions[user.id] ? (
                    <div className="mt-3 rounded-xl bg-muted/40 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">Aktif oturumlar: {activeSessionCount}</p>
                        {canManageStaff && activeSessionCount > 0 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busyUserId === user.id}
                            onClick={() => void revokeAllSessions(user)}
                          >
                            Tüm aktif oturumları kapat
                          </Button>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        {userSessions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Kayıtlı oturum yok.</p>
                        ) : (
                          userSessions.map((session) => (
                            <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-2 text-xs">
                              <div>
                                <p className="font-medium">
                                  {session.userAgent || "Bilinmeyen cihaz"}
                                </p>
                                <p className="text-muted-foreground">
                                  {formatDate(session.createdAt)} · {session.isActive ? "Aktif" : "Kapalı"}
                                </p>
                              </div>
                              {canManageStaff && session.isActive ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busyUserId === user.id}
                                  onClick={() => void revokeOneSession(user, session.id)}
                                >
                                  Oturumu kapat
                                </Button>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}

                  {canManageStaff && !isSelf ? (
                    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                      <Input
                        aria-label={`${user.email} değişiklik nedeni`}
                        placeholder="Değişiklik veya oturum kapatma nedeni"
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
                        ? "Kendi yönetici görevlerinizi bu ekrandan değiştiremezsiniz."
                        : "Bu hesap için değişiklik yetkiniz yok."}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </CardContent>
      </Card>

      {canManageRoles ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-5" aria-hidden="true" />
              Özel görevler
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {roles.filter((role) => !role.isSystem).length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz özel görev oluşturulmadı.</p>
              ) : (
                roles
                  .filter((role) => !role.isSystem)
                  .map((role) => (
                    <Button key={role.key} type="button" variant="outline" size="sm" onClick={() => startRoleEdit(role)}>
                      {role.name}
                    </Button>
                  ))
              )}
            </div>

            <form className="space-y-4" onSubmit={saveCustomRole}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  aria-label="Özel görev adı"
                  placeholder="Örn. Junior Support"
                  required
                  value={roleName}
                  onChange={(event) => setRoleName(event.target.value)}
                />
                <Input
                  aria-label="Özel görev açıklaması"
                  placeholder="Kısa açıklama"
                  value={roleDescription}
                  onChange={(event) => setRoleDescription(event.target.value)}
                />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-xl border p-3">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {permissions.map((permission) => {
                    const checked =
                      permission.key === "admin.access" || rolePermissions.includes(permission.key);
                    return (
                      <label key={permission.key} className="flex items-start gap-2 rounded-lg p-2 text-xs">
                        <Checkbox
                          checked={checked}
                          disabled={permission.key === "admin.access"}
                          onCheckedChange={(value) =>
                            setRolePermissions((current) =>
                              value === true
                                ? [...new Set([...current, permission.key])]
                                : current.filter((key) => key !== permission.key),
                            )
                          }
                        />
                        <span>
                          <span className="block font-medium">{permission.key}</span>
                          <span className="text-muted-foreground">{permission.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <Input
                aria-label="Özel görev değişiklik nedeni"
                placeholder="Oluşturma veya değişiklik nedeni"
                value={roleReason}
                onChange={(event) => setRoleReason(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" isLoading={roleBusy}>
                  {editingRoleKey ? "Özel görevi güncelle" : "Özel görev oluştur"}
                </Button>
                {editingRoleKey ? (
                  <Button type="button" variant="ghost" onClick={resetRoleEditor}>
                    Düzenlemeyi iptal et
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
        <RefreshCw className="mr-2 size-4" aria-hidden="true" />
        Listeyi yenile
      </Button>
    </div>
  );
}
