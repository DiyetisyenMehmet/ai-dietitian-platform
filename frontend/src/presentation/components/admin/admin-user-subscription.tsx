"use client";

import * as React from "react";

import {
  adminClient,
  type AdminPermission,
  type AdminSubscriptionRecordStatus,
  type AdminUserSubscription,
} from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import { Skeleton } from "@/presentation/components/ui/skeleton";
import { AdminSupportEntitlementOperations } from "./admin-support-entitlement-operations";

const PLAN_LABEL = {
  FREE: "Free",
  PREMIUM: "Premium",
  PREMIUM_PLUS: "Premium Plus",
} as const;

const STATUS_LABEL: Record<AdminSubscriptionRecordStatus, string> = {
  PENDING: "Bekliyor",
  ACTIVE: "Aktif",
  PAST_DUE: "Ödeme sorunu",
  CANCELED: "İptal edildi",
  EXPIRED: "Sona erdi",
  REVOKED: "Erişim geri alındı",
};

const SOURCE_LABEL: Record<AdminUserSubscription["currentPlanSource"], string> = {
  GOOGLE_PLAY_ENTITLEMENT: "Google Play entitlement",
  IYZICO_SUBSCRIPTION: "IYZICO subscription",
  ADMIN_SUPPORT: "Admin/Support entitlement",
  ACCOUNT_DEFAULT: "Hesap varsayılanı",
};

const ENTITLEMENT_LABEL: Record<string, string> = {
  DIETITIAN_CHAT: "Diewish Koç",
  BLOOD_TEST_ANALYSIS: "Kan tahlili analizi",
  NUTRITION_PLAN: "Beslenme planı",
  PRIORITY_SUPPORT: "Öncelikli destek",
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("tr-TR") : "Bilgi yok";
}

function cancellationLabel(subscription: AdminUserSubscription) {
  const record = subscription.record;
  if (!record) return "Bilgi yok";
  if (record.cancelAtPeriodEnd === true) return "Dönem sonunda iptal";
  if (record.canceledAt) return `İptal edildi · ${formatDate(record.canceledAt)}`;
  if (record.cancelAtPeriodEnd === false) return "Planlanmış iptal yok";
  return "Bilgi yok";
}

export function AdminUserSubscription({
  userId,
  userEmail,
  permissions,
}: {
  userId: string;
  userEmail: string;
  permissions: readonly AdminPermission[];
}) {
  const allowed = permissions.includes("entitlements.read");
  const [subscription, setSubscription] = React.useState<AdminUserSubscription | null>(null);
  const [loading, setLoading] = React.useState(allowed);
  const [error, setError] = React.useState("");
  const [retry, setRetry] = React.useState(0);

  React.useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void adminClient
      .getUserSubscription(userId)
      .then(({ subscription: next }) => {
        if (!cancelled) setSubscription(next);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const status =
          typeof reason === "object" && reason !== null && "status" in reason
            ? Number(reason.status)
            : 0;
        setError(
          status === 403
            ? "Abonelik ve hak paketi bilgilerini görüntüleme yetkiniz yok."
            : "Abonelik bilgileri yüklenemedi. Lütfen tekrar deneyin.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, retry, userId]);

  if (!allowed) return null;

  return (
    <section
      data-testid="admin-user-subscription"
      className="min-w-0 rounded-2xl border bg-card/80 p-5"
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Abonelik ve hak paketi</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Provider aboneliği salt okunurdur. Admin/Support entitlement ayrı ve kontrollü yönetilir.
          </p>
        </div>
        {subscription && (
          <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs font-semibold">
            {PLAN_LABEL[subscription.currentPlan]}
          </span>
        )}
      </div>

      {loading ? (
        <div role="status" className="mt-4 space-y-3">
          <span className="sr-only">Abonelik bilgileri yükleniyor</span>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <div role="alert" className="mt-4 rounded-xl border border-destructive/20 p-4 text-sm">
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setRetry((value) => value + 1)}
          >
            Tekrar dene
          </Button>
        </div>
      ) : subscription ? (
        <div className="mt-4 space-y-4">
          <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            {[
              ["Current Plan", PLAN_LABEL[subscription.currentPlan]],
              ["Provider Plan", PLAN_LABEL[subscription.providerPlan]],
              [
                "Entitlement status",
                subscription.entitlementStatus === "ACTIVE" ? "Aktif ücretli erişim" : "Free erişim",
              ],
              ["Plan source", SOURCE_LABEL[subscription.currentPlanSource]],
              [
                "Subscription status",
                subscription.record ? STATUS_LABEL[subscription.record.status] : "Kayıt yok",
              ],
              [
                "Provider",
                subscription.record?.provider === "GOOGLE_PLAY"
                  ? "Google Play"
                  : subscription.record?.provider ?? "Bilgi yok",
              ],
              ["Start Date", formatDate(subscription.record?.startDate)],
              ["Expiry / Renewal Date", formatDate(subscription.record?.expiryOrRenewalDate)],
              ["Cancellation", cancellationLabel(subscription)],
              ["Trial", "Bilgi yok"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="min-w-0 rounded-xl border border-border/50 bg-background/50 p-3"
              >
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Entitlements</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {subscription.entitlements.length ? (
                subscription.entitlements.map((entitlement) => (
                  <span
                    key={entitlement}
                    className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                  >
                    {ENTITLEMENT_LABEL[entitlement] ?? entitlement}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Bilgi yok</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/50 p-3 text-sm">
            <p className="font-medium">Admin/Support entitlement</p>
            {subscription.supportEntitlement ? (
              <dl className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Plan</dt>
                  <dd className="font-medium">
                    {PLAN_LABEL[subscription.supportEntitlement.tier]}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Durum</dt>
                  <dd className="font-medium">{subscription.supportEntitlement.status}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Verildi</dt>
                  <dd className="break-words font-medium">
                    {formatDate(subscription.supportEntitlement.grantedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Bitiş</dt>
                  <dd className="break-words font-medium">
                    {subscription.supportEntitlement.expiresAt
                      ? formatDate(subscription.supportEntitlement.expiresAt)
                      : "Süresiz"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-muted-foreground">Support entitlement kaydı yok.</p>
            )}
          </div>

          <AdminSupportEntitlementOperations
            userId={userId}
            userEmail={userEmail}
            permissions={permissions}
            subscription={subscription}
            onChanged={() => setRetry((value) => value + 1)}
          />
        </div>
      ) : null}
    </section>
  );
}
