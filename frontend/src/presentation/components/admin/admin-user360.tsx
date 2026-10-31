"use client";

import * as React from "react";
import Link from "next/link";
import { CircleCheck, CircleHelp, SearchCheck, TriangleAlert } from "lucide-react";
import {
  adminClient,
  type AdminUserSummary,
  type AdminUserSubscription,
} from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import { Skeleton } from "@/presentation/components/ui/skeleton";
import { AdminUserSubscription as SubscriptionPanel } from "./admin-user-subscription";
import { AdminUserOperations } from "./admin-user-operations";
import {
  userDiagnoses,
  type AdminReadState,
  type UserSessionSummary,
  type UserAuditSummary,
  type DiagnosisClass,
} from "./admin-user-diagnostics";

const presentation = {
  "TESPİT EDİLDİ": { icon: TriangleAlert, style: "text-destructive" },
  "OLASI NEDEN": { icon: TriangleAlert, style: "text-amber-700 dark:text-amber-300" },
  "SORUN TESPİT EDİLEMEDİ": { icon: CircleCheck, style: "text-emerald-700 dark:text-emerald-300" },
  DOĞRULANAMADI: { icon: CircleHelp, style: "text-muted-foreground" },
} satisfies Record<DiagnosisClass, { icon: typeof CircleCheck; style: string }>;
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString("tr-TR") : "Bilgi yok";
const denied: AdminReadState<never> = { status: "unavailable" };

export function AdminUser360({
  user,
  permissions,
  onStatus,
}: {
  user: AdminUserSummary;
  permissions: string[];
  onStatus: (active: boolean) => void;
}) {
  const [subscription, setSubscription] = React.useState<AdminReadState<AdminUserSubscription>>({
    status: "loading",
  });
  const [sessions, setSessions] = React.useState<AdminReadState<UserSessionSummary>>({
    status: "loading",
  });
  const [audit, setAudit] = React.useState<AdminReadState<UserAuditSummary[]>>({
    status: "loading",
  });
  const [attempt, setAttempt] = React.useState(0);
  const canAudit = permissions.includes("audit.read");
  const canSubscribe = permissions.includes("entitlements.read");
  const canSessions = permissions.includes("users.sessions.revoke") && user.role === "USER";
  React.useEffect(() => {
    if (!canAudit) {
      setAudit({ status: "unavailable" });
      return;
    }
    let cancelled = false;
    setAudit({ status: "loading" });
    void adminClient
      .getAudit({ user: user.id, limit: 8 })
      .then(({ events }) => {
        if (!cancelled)
          setAudit({
            status: "ready",
            data: events
              .filter((event) => event.targetType === "user" && event.targetId === user.id)
              .map(({ id, action, module, riskLevel, createdAt, targetId, targetType }) => ({
                id,
                action,
                module,
                riskLevel,
                createdAt,
                targetId,
                targetType,
              })),
          });
      })
      .catch(() => {
        if (!cancelled) setAudit({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, canAudit, attempt]);
  const safeSubscription = canSubscribe ? subscription : denied;
  const safeSessions = canSessions ? sessions : denied;
  const safeAudit = canAudit ? audit : denied;
  const diagnoses = userDiagnoses(user, safeSubscription, safeSessions, safeAudit);
  return (
    <div className="min-w-0 space-y-5" data-testid="admin-user360">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-2xl border bg-card p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Kullanıcı 360
          </p>
          <h2 className="mt-2 break-words text-xl font-semibold">
            {user.fullName || "İsim belirtilmemiş"}
          </h2>
          <p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${user.isActive ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}
        >
          {user.isActive ? "Aktif" : "Pasif"}
        </span>
      </div>
      {!user.isActive && (
        <p
          role="status"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          TESPİT EDİLDİ · Hesap pasif; uygulama erişimi engellenir.
        </p>
      )}
      <nav aria-label="Kullanıcı bölümleri" className="flex flex-wrap gap-2">
        {[
          ["Genel", "general"],
          ["Abonelik", "subscription"],
          ["Oturumlar", "sessions"],
          ["Yönetici geçmişi", "audit"],
          ["Tanı Merkezi", "diagnostics"],
        ].map(([label, id]) => (
          <a
            key={id}
            href={`#user360-${id}`}
            className="rounded-lg border bg-card px-3 py-2 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
        <section
          id="user360-general"
          className="min-w-0 scroll-mt-24 rounded-2xl border bg-card p-5"
        >
          <h2 className="mb-4 font-semibold">Hesap</h2>
          <dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2">
            {[
              ["Kullanıcı ID", user.id],
              ["Ad / soyad", user.fullName || "İsim belirtilmemiş"],
              ["E-posta", user.email],
              ["Hesap rolü", user.role === "ADMIN" ? "Yönetici" : "Kullanıcı"],
              ["Hesap durumu", user.isActive ? "Aktif" : "Pasif"],
              [
                "E-posta doğrulama",
                user.emailVerifiedAt
                  ? `Doğrulanmış · ${date(user.emailVerifiedAt)}`
                  : "Doğrulanmamış",
              ],
              ["Kayıt tarihi", date(user.createdAt)],
              ["Son giriş", date(user.lastLoginAt)],
              ["Başlangıç kurulumu", user.onboardingCompleted ? "Tamamlanmış" : "Tamamlanmamış"],
              ["Kayıtlı plan", user.subscriptionTier || "Bilgi yok"],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-all font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <div id="user360-subscription" className="min-w-0 scroll-mt-24">
          {canSubscribe ? (
            <SubscriptionPanel
              userId={user.id}
              userEmail={user.email}
              permissions={permissions}
              onReadState={setSubscription}
            />
          ) : (
            <Unavailable title="Abonelik" />
          )}
        </div>
      </div>
      <section
        id="user360-diagnostics"
        aria-label="Tanı Merkezi"
        className="min-w-0 scroll-mt-24 rounded-2xl border bg-card p-5 sm:p-6"
      >
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <SearchCheck className="size-5 text-primary" aria-hidden="true" />
          Tanı Merkezi
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Yalnız görüntülenebilen hesap kayıtlarından salt okunur değerlendirme. Kesin hata nedeni
          veya sağlık değerlendirmesi değildir; bir kaydın olmaması olayın yaşanmadığını kanıtlamaz.
        </p>
        <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
          {diagnoses.map((item) => {
            const { icon: Icon, style } = presentation[item.classification];
            return (
              <article
                key={item.key}
                data-testid={`diagnosis-${item.key}`}
                className="min-w-0 rounded-xl border bg-background/60 p-4"
              >
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className={`mt-2 flex items-start gap-2 text-xs font-bold ${style}`}>
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.classification}
                </p>
                <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">
                  {item.evidence}
                </p>
              </article>
            );
          })}
        </div>
      </section>
      <div id="user360-sessions" className="min-w-0 scroll-mt-24">
        <AdminUserOperations
          user={user}
          permissions={permissions}
          onStatus={onStatus}
          onReadState={setSessions}
        />
        {!canSessions && <Unavailable title="Oturum bilgileri" />}
      </div>
      <section
        id="user360-audit"
        aria-label="Kullanıcıya ait yönetici geçmişi"
        className="min-w-0 scroll-mt-24 rounded-2xl border bg-card p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Yönetici geçmişi</h2>
          {canAudit && (
            <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
              Geçmişi yenile
            </Button>
          )}
        </div>
        {safeAudit.status === "unavailable" ? (
          <p className="mt-3 text-sm text-muted-foreground">Bu bölümü görüntüleme yetkiniz yok.</p>
        ) : safeAudit.status === "loading" ? (
          <div role="status" className="mt-4 space-y-2">
            <span className="sr-only">Yönetici geçmişi yükleniyor</span>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : safeAudit.status === "error" ? (
          <div role="alert" className="mt-3 space-y-3">
            <p className="text-sm">
              Yönetici geçmişi yüklenemedi; diğer hesap bilgileri kullanılabilir.
            </p>
            <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
              Tekrar dene
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            {!safeAudit.data.length ? (
              <p className="text-sm text-muted-foreground">
                Görüntülenebilir yakın kayıt bulunamadı.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {safeAudit.data.map((event) => (
                  <li key={event.id} className="min-w-0 py-3">
                    <p className="break-words text-sm font-medium">{event.action}</p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {event.module} · {event.riskLevel} · {date(event.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link
              className="mt-3 inline-block rounded text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href="/admin/audit"
            >
              Tam işlem geçmişini aç
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
function Unavailable({ title }: { title: string }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Bu bölümü görüntüleme yetkiniz yok veya bu hesap türünde desteklenmiyor.
      </p>
    </section>
  );
}
