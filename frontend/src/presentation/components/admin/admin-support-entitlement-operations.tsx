"use client";

import * as React from "react";

import {
  adminClient,
  type AdminPermission,
  type AdminUserSubscription,
} from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalTitle,
} from "@/presentation/components/ui/modal";

type Action = "upsert" | "revoke" | null;
type SupportTier = "PREMIUM" | "PREMIUM_PLUS";

const PLAN_LABEL = {
  FREE: "Free",
  PREMIUM: "Premium",
  PREMIUM_PLUS: "Premium Plus",
} as const;

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIso(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("tr-TR") : "Bitiş tarihi yok";
}

const STATUS_LABEL = {
  ACTIVE: "Aktif",
  EXPIRED: "Süresi doldu",
  REVOKED: "Sonlandırıldı",
} as const;

export function AdminSupportEntitlementOperations({
  userId,
  userEmail,
  permissions,
  subscription,
  onChanged,
}: {
  userId: string;
  userEmail: string;
  permissions: readonly AdminPermission[];
  subscription: AdminUserSubscription;
  onChanged: () => void;
}) {
  const canGrant = permissions.includes("entitlements.grant");
  const canRevoke = permissions.includes("entitlements.revoke");
  const current = subscription.supportEntitlement;
  const canRevokeCurrent = canRevoke && current?.status === "ACTIVE";
  const [tier, setTier] = React.useState<SupportTier>(
    current?.tier === "PREMIUM_PLUS" ? "PREMIUM_PLUS" : "PREMIUM",
  );
  const [expiry, setExpiry] = React.useState(toLocalInput(current?.expiresAt));
  const [action, setAction] = React.useState<Action>(null);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const inFlight = React.useRef(false);

  React.useEffect(() => {
    setTier(current?.tier === "PREMIUM_PLUS" ? "PREMIUM_PLUS" : "PREMIUM");
    setExpiry(toLocalInput(current?.expiresAt));
  }, [current?.expiresAt, current?.tier, current?.updatedAt]);

  if (!canGrant && !canRevoke) return null;

  const open = (next: Exclude<Action, null>) => {
    if (next === "upsert") {
      const expiresAt = toIso(expiry);
      if (!expiresAt || new Date(expiresAt) <= new Date()) {
        setError("Gelecekteki bir bitiş tarihi seçin. Destek hakkı süresiz verilemez.");
        return;
      }
    }
    setAction(next);
    setReason("");
    setError("");
    setSuccess("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!action || inFlight.current || reason.trim().length < 3) return;

    const expiresAt = toIso(expiry);
    if (action === "upsert" && !expiresAt) {
      setError("Geçerli bir bitiş tarihi seçin.");
      return;
    }
    if (action === "upsert" && expiresAt && new Date(expiresAt) <= new Date()) {
      setError("Bitiş tarihi gelecekte olmalıdır.");
      return;
    }
    if (action === "revoke" && !current?.updatedAt) {
      setError("Destek hakkı durumu değişti. Sayfayı yenileyin.");
      return;
    }

    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (action === "upsert") {
        await adminClient.setUserSupportEntitlement(userId, {
          tier,
          expiresAt: expiresAt!,
          expectedUpdatedAt: current?.updatedAt ?? null,
          reason: reason.trim(),
        });
        setSuccess("Destek hakkı güncellendi ve işlem kaydı oluşturuldu.");
      } else {
        await adminClient.revokeUserSupportEntitlement(userId, current!.updatedAt, reason.trim());
        setSuccess("Destek hakkı sonlandırıldı ve işlem kaydı oluşturuldu.");
      }
      setAction(null);
      onChanged();
    } catch (cause: unknown) {
      const status =
        typeof cause === "object" && cause && "status" in cause ? Number(cause.status) : 0;
      setError(
        status === 403
          ? "Bu destek hakkı işlemi için yetkiniz yok."
          : status === 409
            ? "Destek hakkı durumu değişti veya aynı işlem zaten uygulandı. Sayfayı yenileyin."
            : status === 422 || status === 400
              ? "İşlem bilgileri geçersiz. Gerekçe ve bitiş tarihini kontrol edin."
              : "İşlem doğrulanamadı. Yeniden denemeden önce güncel durumu kontrol edin.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div data-testid="admin-support-entitlement-operations" className="min-w-0 space-y-4">
      <div>
        <h3 className="font-medium">Destek hakkı yönetimi</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Geçici Premium veya Premium Plus erişimi sağlayın. Google Play ve IYZICO abonelikleri ile
          ödeme kayıtları değişmez.
        </p>
      </div>

      {success && (
        <p role="status" className="text-sm text-primary">
          {success}
        </p>
      )}

      {canGrant && (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm">
            <span className="mb-1 block font-medium">Destek planı</span>
            <select
              aria-label="Destek planı"
              value={tier}
              disabled={busy}
              onChange={(event) => setTier(event.target.value as SupportTier)}
              className="h-11 w-full min-w-0 rounded-xl border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="PREMIUM">Premium</option>
              <option value="PREMIUM_PLUS">Premium Plus</option>
            </select>
          </label>
          <label className="min-w-0 text-sm">
            <span className="mb-1 block font-medium">Bitiş tarihi</span>
            <input
              aria-label="Destek hakkı bitiş tarihi"
              aria-describedby="admin-support-expiry-help"
              type="datetime-local"
              required
              value={expiry}
              disabled={busy}
              onChange={(event) => setExpiry(event.target.value)}
              className="h-11 w-full min-w-0 max-w-full rounded-xl border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span
              id="admin-support-expiry-help"
              className="mt-1 block text-xs text-muted-foreground"
            >
              Gelecekteki bir bitiş tarihi zorunludur. Süresiz destek hakkı verilemez.
            </span>
          </label>
        </div>
      )}

      {error && !action && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canGrant && (
          <Button variant="outline" disabled={busy} onClick={() => open("upsert")}>
            {current?.status === "ACTIVE" ? "Destek hakkını güncelle" : "Destek hakkı ver"}
          </Button>
        )}
        {canRevokeCurrent && (
          <Button variant="outline" disabled={busy} onClick={() => open("revoke")}>
            Destek hakkını sonlandır
          </Button>
        )}
      </div>

      <Modal
        open={action !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setAction(null);
        }}
      >
        <ModalContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <ModalTitle>
            {action === "revoke" ? "Destek hakkını sonlandır" : "Destek hakkı değişikliğini onayla"}
          </ModalTitle>
          <ModalDescription className="break-all">
            {userEmail} · {userId}
          </ModalDescription>

          <div className="space-y-2 rounded-xl border bg-background/60 p-3 text-sm">
            <p>
              Mevcut etkin plan: <strong>{PLAN_LABEL[subscription.currentPlan]}</strong>
            </p>
            <p>
              Mevcut destek hakkı:{" "}
              <strong>
                {current
                  ? `${PLAN_LABEL[current.tier]} · ${STATUS_LABEL[current.status]} · ${formatDate(current.expiresAt)}`
                  : "Yok"}
              </strong>
            </p>
            {action === "upsert" && (
              <>
                <p>
                  Yeni destek planı: <strong>{PLAN_LABEL[tier]}</strong>
                </p>
                <p>
                  Yeni bitiş: <strong>{formatDate(toIso(expiry))}</strong>
                </p>
              </>
            )}
            <p className="font-medium">
              Google Play/IYZICO aboneliği ve ödeme kayıtları değiştirilmeyecek.
            </p>
          </div>

          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div>
              <label
                htmlFor="admin-support-entitlement-reason"
                className="mb-2 block text-sm font-medium"
              >
                İşlem gerekçesi
              </label>
              <textarea
                id="admin-support-entitlement-reason"
                required
                minLength={3}
                maxLength={500}
                disabled={busy}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="min-h-24 w-full resize-y rounded-xl border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                3–500 karakter. Sağlık bilgisi, ödeme verisi, parola veya gizli anahtar yazmayın.
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
              <Button type="submit" disabled={busy || reason.trim().length < 3}>
                {busy ? "İşleniyor…" : "Onayla ve uygula"}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
