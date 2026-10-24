"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  CircleCheck,
  CircleHelp,
  TriangleAlert,
  CircleX,
  RefreshCw,
} from "lucide-react";

import {
  adminClient,
  type AdminSession,
  type AdminSystemStatus,
} from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/presentation/components/ui/card";

const statusPresentation = {
  healthy: {
    label: "Sağlıklı",
    icon: CircleCheck,
    style: "text-emerald-700 dark:text-emerald-300",
  },
  attention: { label: "Dikkat", icon: TriangleAlert, style: "text-amber-700 dark:text-amber-300" },
  problem: { label: "Sorun", icon: CircleX, style: "text-destructive" },
  unknown: { label: "Bilinmiyor", icon: CircleHelp, style: "text-muted-foreground" },
};

function Status({ value }: { value: AdminSystemStatus }) {
  const { label, icon: Icon, style } = statusPresentation[value] ?? statusPresentation.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${style}`}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

function time(value: string) {
  return new Date(value).toLocaleString("tr-TR");
}

function ReadPanel<T>({
  title,
  load,
  children,
}: {
  title: string;
  load: () => Promise<T>;
  children: (data: T) => React.ReactNode;
}) {
  const [attempt, setAttempt] = React.useState(0);
  const [state, setState] = React.useState<{ data?: T; loading: boolean; error: boolean }>({
    loading: true,
    error: false,
  });
  React.useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: false });
    void load().then(
      (data) => {
        if (!cancelled) setState({ data, loading: false, error: false });
      },
      () => {
        if (!cancelled) setState({ loading: false, error: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, attempt]);
  return (
    <Card className="min-w-0 border-border/60">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>
          <h2 className="text-base leading-snug">{title}</h2>
        </CardTitle>
        <Button
          size="icon"
          variant="ghost"
          disabled={state.loading}
          aria-label={`${title} yenile`}
          onClick={() => setAttempt((value) => value + 1)}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent aria-busy={state.loading}>
        {state.loading ? (
          <p role="status" className="py-6 text-sm text-muted-foreground">
            {title} yükleniyor…
          </p>
        ) : state.error ? (
          <div role="alert" className="space-y-3 rounded-xl border border-border p-4">
            <p className="text-sm">
              Veri mevcut değil. Kontrol tamamlanamadı veya erişim izniniz değişti.
            </p>
            <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              Tekrar dene
            </Button>
          </div>
        ) : state.data !== undefined ? (
          children(state.data)
        ) : (
          <p>Veri mevcut değil.</p>
        )}
      </CardContent>
    </Card>
  );
}

const loadHealth = () => adminClient.getSystemHealth();
const loadOperations = () => adminClient.getOperationsSummary();
const loadAudit = () => adminClient.getAudit({ limit: 5 });
const checkLabels = {
  backend: "Backend (sunucu)",
  frontend: "Frontend (arayüz)",
  database: "Veritabanı",
  authentication: "Kimlik doğrulama",
  scheduler: "Bildirim zamanlayıcısı",
  criticalServices: "Kritik harici servisler",
} as const;

export function AdminSystemPanel({ compact = false }: { compact?: boolean }) {
  return (
    <section className="min-w-0 space-y-4" aria-label="Sistem sağlığı">
      {!compact && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Operasyon</p>
          <h1 className="mt-1 text-2xl font-bold">Sistem Durumu</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Bu Management Center sunucusunun salt okunur kontrolü. Bağımsız uygulama ortamının
            sağlığını kanıtlamaz.
          </p>
        </div>
      )}
      <ReadPanel title="Sistem sağlığı" load={loadHealth}>
        {(data) => (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/60 p-4">
              <div>
                <p className="text-sm font-medium">Genel sağlık durumu</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  İzlenmeyen bileşenler genel duruma dahildir.
                </p>
              </div>
              <Status value={data.status} />
            </div>
            <dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Ortam</dt>
                <dd className="mt-1 font-semibold uppercase">{data.environment}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Uygulama sürümü (SHA)</dt>
                <dd className="mt-1 break-all font-mono text-xs">
                  {data.commit === "unknown" ? "Veri mevcut değil" : data.commit}
                </dd>
              </div>
            </dl>
            <div
              className={`grid gap-3 ${compact ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2"}`}
            >
              {Object.entries(checkLabels).map(([key, label]) => {
                const check = data.checks[key as keyof typeof checkLabels];
                return (
                  <div key={key} className="min-w-0 rounded-xl border border-border/70 p-4">
                    <h3 className="mb-2 text-sm font-semibold">{label}</h3>
                    <Status value={check?.status ?? "unknown"} />
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {check?.detail ?? "Veri mevcut değil"}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Son kontrol: {time(data.timestamp)} · Anlık görüntü en fazla 15 saniye saklanır.
            </p>
            {!compact && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Sağlıklı: sınanan bileşen yanıt verdi. Dikkat: eksik yapılandırma veya bilinçli
                duraklatma var. Sorun: kontrol başarısız. Bilinmiyor: çalışma durumu henüz
                izlenmiyor.
              </p>
            )}
          </div>
        )}
      </ReadPanel>
    </section>
  );
}

function OperationsSummary() {
  return (
    <ReadPanel title="Kullanıcı ve plan özeti" load={loadOperations}>
      {(data) => (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Admin veritabanındaki normal kullanıcılar; aktiflik hesap durumudur, yakın zamanlı
            kullanım değildir.
          </p>
          <dl className="grid grid-cols-3 gap-2">
            {(
              [
                ["Toplam", data.users.total],
                ["Aktif", data.users.active],
                ["Pasif", data.users.inactive],
              ] as const
            ).map(([label, count]) => (
              <div key={label} className="rounded-xl bg-secondary/60 p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-all text-xl font-bold tabular-nums">
                  {count.toLocaleString("tr-TR")}
                </dd>
              </div>
            ))}
          </dl>
          <div>
            <h3 className="text-sm font-semibold">Kayıtlı hesap planları</h3>
            <dl className="mt-2 divide-y divide-border">
              {(
                [
                  ["Ücretsiz", data.accountPlans.FREE],
                  ["Premium", data.accountPlans.PREMIUM],
                  ["Premium Plus", data.accountPlans.PREMIUM_PLUS],
                ] as const
              ).map(([label, count]) => (
                <div key={label} className="flex justify-between gap-3 py-2 text-sm">
                  <dt>{label}</dt>
                  <dd className="font-semibold tabular-nums">{count.toLocaleString("tr-TR")}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Etkin abonelik özeti: Henüz izlenmiyor. Kayıtlı plan dağılımı ödeme sağlayıcısı veya
            destek haklarıyla hesaplanan etkin abonelik sayısı değildir.
          </p>
          <p className="text-xs text-muted-foreground">
            Son kontrol: {time(data.timestamp)} · Özet en fazla 30 saniye saklanır.
          </p>
        </div>
      )}
    </ReadPanel>
  );
}

function RecentAudit() {
  return (
    <ReadPanel title="Son Admin işlemleri" load={loadAudit}>
      {({ events }) => (
        <div className="space-y-4">
          {!events.length ? (
            <p className="text-sm text-muted-foreground">Henüz işlem kaydı yok.</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((event) => (
                <li key={event.id} className="min-w-0 space-y-1 py-3 first:pt-0">
                  <p className="break-words text-sm font-medium">{event.action}</p>
                  <p className="break-words text-xs text-muted-foreground">
                    {event.module} · Risk: {event.riskLevel} · {time(event.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/audit"
            className="inline-flex items-center gap-2 rounded text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tüm işlem geçmişi
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </ReadPanel>
  );
}

const actions = [
  { label: "Kullanıcı bul", href: "/admin/users", permissions: ["users.read"] },
  {
    label: "Yetkilileri yönet",
    href: "/admin/access",
    permissions: ["admin.staff.read", "admin.roles.read"],
  },
  { label: "İşlem geçmişi", href: "/admin/audit", permissions: ["audit.read"] },
  { label: "Sistem durumunu aç", href: "/admin/system", permissions: ["system.read"] },
];

export function AdminOwnerDashboard({ session }: { session: AdminSession }) {
  const can = (key: string) => session.permissions.includes(key);
  return (
    <div className="min-w-0 space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Activity className="size-4" aria-hidden="true" />
          Genel Bakış
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Yönetim merkezi</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Diewish operasyonlarının durumu, hesap özeti ve son yönetim işlemleri.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          {session.roles.includes("SUPER_ADMIN") ? "Süper Yönetici" : "Yetkili çalışan"} ·{" "}
          {session.environment.environment.toUpperCase()}
        </p>
      </div>
      <section aria-label="Hızlı erişim" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actions
          .filter((action) => action.permissions.every(can))
          .map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm font-semibold transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {action.label}
              <ArrowUpRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
            </Link>
          ))}
      </section>
      {can("system.read") ? (
        <AdminSystemPanel compact />
      ) : (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            Sistem durumunu görüntüleme izniniz yok.
          </CardContent>
        </Card>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        {can("operations.read") && <OperationsSummary />}
        {can("audit.read") && <RecentAudit />}
      </div>
    </div>
  );
}
