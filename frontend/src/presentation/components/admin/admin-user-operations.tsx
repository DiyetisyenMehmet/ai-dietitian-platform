"use client";

import * as React from "react";
import {
  adminClient,
  type AdminUserSummary,
  type AdminUserSession,
} from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/presentation/components/ui/modal";

type Action =
  | { kind: "status"; isActive: boolean }
  | { kind: "session"; id: string; device: string }
  | { kind: "all" };
const title = (action: Action | null) =>
  action?.kind === "status"
    ? action.isActive
      ? "Hesabı aktif yap"
      : "Hesabı pasif yap"
    : action?.kind === "session"
      ? "Oturumu sonlandır"
      : "Tüm oturumları sonlandır";
const formatDate = (value: string) => new Date(value).toLocaleString("tr-TR");

export function AdminUserOperations({
  user,
  permissions,
  onStatus,
}: {
  user: AdminUserSummary;
  permissions: string[];
  onStatus: (active: boolean) => void;
}) {
  const canManage = permissions.includes("users.manage");
  const canRevoke = permissions.includes("users.sessions.revoke");
  const [sessions, setSessions] = React.useState<AdminUserSession[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(canRevoke);
  const [loadError, setLoadError] = React.useState("");
  const [reload, setReload] = React.useState(0);
  const [action, setAction] = React.useState<Action | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const inFlight = React.useRef(false);
  const trigger = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!canRevoke || user.role !== "USER") return;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void adminClient
      .getUserSessions(user.id)
      .then((data) => {
        if (!cancelled) {
          setSessions(data.sessions);
          setTotal(data.total);
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const status =
          typeof cause === "object" && cause && "status" in cause ? Number(cause.status) : 0;
        if (status === 401) window.location.replace("/admin/login");
        setLoadError(
          status === 403
            ? "Oturumları görüntüleme yetkiniz yok."
            : "Oturumlar yüklenemedi. Tekrar deneyin.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canRevoke, user.id, user.role, reload]);
  if (user.role !== "USER" || (!canManage && !canRevoke)) return null;

  const open = (next: Action, element: HTMLElement) => {
    trigger.current = element;
    setAction(next);
    setReason("");
    setError("");
    setSuccess("");
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!action || inFlight.current || reason.trim().length < 3) return;
    const requested = action;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (requested.kind === "status") {
        const result = await adminClient.setUserStatus(user.id, requested.isActive, reason.trim());
        onStatus(result.isActive);
      } else if (requested.kind === "session") {
        await adminClient.revokeUserSession(user.id, requested.id, reason.trim());
      } else {
        await adminClient.revokeAllUserSessions(user.id, reason.trim());
      }
      setSuccess(
        requested.kind === "status"
          ? "Hesap durumu güncellendi ve işlem kaydedildi."
          : "Oturum yenileme erişimi iptal edildi ve işlem kaydedildi.",
      );
      setAction(null);
      setReload((value) => value + 1);
    } catch (cause: unknown) {
      const status =
        typeof cause === "object" && cause && "status" in cause ? Number(cause.status) : 0;
      if (status === 401) window.location.replace("/admin/login");
      setError(
        status === 403
          ? "Bu işlem için yetkiniz yok."
          : status === 409
            ? "Hesap veya oturum durumu değişti. Pencereyi kapatıp sayfayı yenileyin."
            : status === 404
              ? "Kullanıcı veya oturum bulunamadı."
              : "İşlem doğrulanamadı. Yeniden denemeden önce sayfayı yenileyip durumu kontrol edin.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      aria-label="Kullanıcı işlemleri"
      className="min-w-0 space-y-4 rounded-2xl border bg-card/80 p-5"
    >
      <h2 className="font-semibold">Kullanıcı işlemleri</h2>
      {success && (
        <p role="status" className="text-sm text-primary">
          {success}
        </p>
      )}
      {canManage && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pasif hesap uygulamaya erişemez. Yeniden aktifleştirildiğinde süresi dolmamış oturumları
            kullanılabilir.
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={(event) =>
              open({ kind: "status", isActive: !user.isActive }, event.currentTarget)
            }
          >
            {user.isActive ? "Hesabı pasif yap" : "Hesabı aktif yap"}
          </Button>
        </div>
      )}
      {canRevoke && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-medium">Aktif oturumlar</h3>
            <Button
              variant="outline"
              disabled={busy || loading}
              onClick={() => setReload((value) => value + 1)}
            >
              Oturumları yenile
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Oturum sonlandırma, mevcut Diewish oturumunun yenilenmesini engeller. Verilmiş erişim
            anahtarı süresi dolana kadar çalışabilir; yeni girişleri engellemez.
          </p>
          {loading ? (
            <p role="status">Oturumlar yükleniyor…</p>
          ) : loadError ? (
            <p role="alert">{loadError}</p>
          ) : (
            <>
              <p className="text-sm">
                {total} aktif oturum
                {total > sessions.length ? ` · Son ${sessions.length} oturum gösteriliyor` : ""}
              </p>
              {!sessions.length ? (
                <p className="text-sm text-muted-foreground">Aktif oturum bulunamadı.</p>
              ) : (
                <>
                  <ul className="space-y-3">
                    {sessions.map((session) => (
                      <li
                        key={session.id}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                      >
                        <div className="min-w-0 text-sm">
                          <p className="break-words font-medium">{session.device}</p>
                          <p className="mt-1">Başlangıç: {formatDate(session.createdAt)}</p>
                          <p className="text-muted-foreground">
                            Bitiş: {formatDate(session.expiresAt)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          disabled={busy}
                          aria-label={`${session.device} oturumunu sonlandır`}
                          onClick={(event) =>
                            open(
                              { kind: "session", id: session.id, device: session.device },
                              event.currentTarget,
                            )
                          }
                        >
                          Sonlandır
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={(event) => open({ kind: "all" }, event.currentTarget)}
                  >
                    Tüm oturumları sonlandır
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      )}
      <Modal
        open={action !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setAction(null);
        }}
      >
        <ModalContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <ModalTitle className="pr-7 leading-snug">{title(action)}</ModalTitle>
          <ModalDescription className="break-all">
            {user.email} hesabı için bu işlemi onaylıyor musunuz?
          </ModalDescription>
          <p className="text-sm">
            {action?.kind === "status"
              ? action.isActive
                ? "Kullanıcı yeniden uygulamaya erişebilir. Süresi dolmamış oturumları tekrar kullanılabilir."
                : "Kullanıcının uygulamaya erişimi engellenir. Hesap ve verileri silinmez."
              : "Oturum yenileme erişimi iptal edilir. Mevcut erişim anahtarı süresi dolana kadar geçerli kalabilir. İşlem yeni girişleri engellemez."}
          </p>
          {action?.kind === "session" && <p className="text-sm">Seçilen cihaz: {action.device}</p>}
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div>
              <label
                htmlFor="admin-user-operation-reason"
                className="mb-2 block text-sm font-medium"
              >
                İşlem gerekçesi
              </label>
              <textarea
                id="admin-user-operation-reason"
                className="min-h-24 w-full resize-y rounded-xl border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
                minLength={3}
                maxLength={500}
                disabled={busy}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-describedby="operation-reason-help"
              />
              <p id="operation-reason-help" className="mt-1 text-xs text-muted-foreground">
                3–500 karakter. Sağlık bilgisi, parola veya gizli anahtar yazmayın. İşlem ve gerekçe
                kaydedilir.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <ModalFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Vazgeç
              </Button>
              <Button type="submit" disabled={busy || reason.trim().length < 3 || Boolean(error)}>
                {busy ? "İşleniyor…" : "Onayla ve uygula"}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </section>
  );
}
