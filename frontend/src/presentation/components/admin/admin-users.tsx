"use client";

import * as React from "react";
import Link from "next/link";
import {
  adminClient,
  type AdminUserSummary,
  type AdminUsersResult,
} from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import { Skeleton } from "@/presentation/components/ui/skeleton";

const date = (value: string | null) =>
  value ? new Date(value).toLocaleString("tr-TR") : "Bilgi yok";
const plan = (value: AdminUserSummary["subscriptionTier"]) =>
  value
    ? ({ FREE: "Free", PREMIUM: "Premium", PREMIUM_PLUS: "Premium Plus" }[value] ?? "Bilgi yok")
    : "Bilgi yok";
function Status({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-secondary text-foreground"}`}
    >
      {active ? "Aktif" : "Pasif"}
    </span>
  );
}
const linkStyle =
  "rounded text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AdminUsers({ userId }: { userId?: string }) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [query, setQuery] = React.useState({ search: "", status: "all", page: 1, limit: 25 });
  const [result, setResult] = React.useState<AdminUsersResult | null>(null);
  const [user, setUser] = React.useState<AdminUserSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setResult(null);
    setUser(null);
    const request = userId
      ? adminClient.getUser(userId).then((data) => {
          if (!cancelled) setUser(data.user);
        })
      : adminClient.listUsers(query).then((data) => {
          if (!cancelled) setResult(data);
        });
    void request
      .catch((reason: unknown) => {
        if (cancelled) return;
        const code =
          typeof reason === "object" && reason !== null && "status" in reason
            ? Number(reason.status)
            : 0;
        if (code === 401) {
          window.location.replace("/admin/login");
          return;
        }
        setError(
          code === 403
            ? "Bu kullanıcı bilgilerini görüntüleme yetkiniz yok."
            : code === 404
              ? "Kullanıcı bulunamadı."
              : "Kullanıcı bilgileri yüklenemedi. Lütfen tekrar deneyin.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, userId, retry]);

  return (
    <section className="min-w-0 space-y-5" aria-busy={loading}>
      <div>
        {userId && (
          <Link className={linkStyle} href="/admin/users">
            Kullanıcılara dön
          </Link>
        )}
        <h1 className="mt-2 break-words text-2xl font-bold tracking-tight">
          {userId ? "Kullanıcı detayı" : "Kullanıcılar"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Hesap bilgilerini ve kayıtlı planı salt okunur olarak inceleyin.
        </p>
      </div>
      {!userId && (
        <form
          className="grid gap-3 rounded-2xl border border-border/60 bg-card/80 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery({ search: search.trim(), status, page: 1, limit: 25 });
          }}
        >
          <div className="min-w-0">
            <label htmlFor="admin-user-search" className="mb-1.5 block text-sm font-medium">
              Kullanıcı ara
            </label>
            <Input
              id="admin-user-search"
              type="search"
              maxLength={254}
              placeholder="E-posta veya kullanıcı ID ile ara"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="admin-user-status" className="mb-1.5 block text-sm font-medium">
              Hesap durumu
            </label>
            <select
              id="admin-user-status"
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">Tümü</option>
              <option value="active">Aktif</option>
              <option value="inactive">Pasif</option>
            </select>
          </div>
          <Button type="submit" disabled={loading}>
            Ara
          </Button>
        </form>
      )}
      {loading ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Kullanıcı bilgileri yükleniyor</span>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border bg-card p-5">
          <p>{error}</p>
          <Button variant="outline" className="mt-3" onClick={() => setRetry((value) => value + 1)}>
            Tekrar dene
          </Button>
        </div>
      ) : user ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-card/80 p-5">
            <div className="min-w-0">
              <h2 className="break-words text-lg font-semibold">
                {user.fullName || "İsim belirtilmemiş"}
              </h2>
              <p className="break-all text-sm text-muted-foreground">{user.email}</p>
            </div>
            <Status active={user.isActive} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-2xl border bg-card/80 p-5">
              <h2 className="mb-4 font-semibold">Hesap</h2>
              <dl className="space-y-3 text-sm">
                {[
                  ["Kullanıcı ID", user.id],
                  ["E-posta", user.email],
                  ["Hesap rolü", user.role === "ADMIN" ? "Yönetici" : "Kullanıcı"],
                  ["E-posta doğrulama", user.emailVerifiedAt ? "Doğrulanmış" : "Doğrulanmamış"],
                  ["Kayıt tarihi", date(user.createdAt)],
                  ["Son giriş", date(user.lastLoginAt)],
                  [
                    "Başlangıç kurulumu",
                    user.onboardingCompleted ? "Tamamlanmış" : "Tamamlanmamış",
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 break-all font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="min-w-0 self-start rounded-2xl border bg-card/80 p-5">
              <h2 className="mb-4 font-semibold">Abonelik</h2>
              <dl className="text-sm">
                <dt className="text-muted-foreground">Kayıtlı plan</dt>
                <dd className="mt-1 font-medium">{plan(user.subscriptionTier)}</dd>
              </dl>
              <p className="mt-3 text-sm text-muted-foreground">
                Hesapta kayıtlı plan bilgisidir. Ödeme veya hak paketi değişikliği yapılamaz.
              </p>
            </div>
          </div>
        </>
      ) : (
        result && (
          <>
            {!result.users.length ? (
              <p role="status" className="rounded-2xl border bg-card p-6 text-sm">
                Bu kriterlere uyan kullanıcı bulunamadı.
              </p>
            ) : (
              <>
                <div className="hidden rounded-2xl border bg-card/80 p-3 lg:block">
                  <table className="w-full table-fixed text-left text-sm">
                    <caption className="sr-only">Kullanıcı hesapları</caption>
                    <thead>
                      <tr>
                        {[
                          "Kullanıcı / E-posta",
                          "Durum",
                          "Kayıtlı plan",
                          "Kayıt / Son giriş",
                          "Detay",
                        ].map((label, i) => (
                          <th
                            key={label}
                            scope="col"
                            className={`p-2 font-semibold ${i === 0 ? "w-[30%]" : i === 3 ? "w-[25%]" : "w-[15%]"}`}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.users.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="break-all p-2">
                            <p className="font-medium">{item.fullName || "İsim belirtilmemiş"}</p>
                            <p className="mt-1 text-muted-foreground">{item.email}</p>
                          </td>
                          <td className="p-2">
                            <Status active={item.isActive} />
                          </td>
                          <td className="p-2">{plan(item.subscriptionTier)}</td>
                          <td className="p-2">
                            <p>{date(item.createdAt)}</p>
                            <p className="mt-1 text-muted-foreground">{date(item.lastLoginAt)}</p>
                          </td>
                          <td className="p-2">
                            <Link
                              className={linkStyle}
                              href={`/admin/users/${encodeURIComponent(item.id)}`}
                              aria-label={`${item.email} kullanıcı detayı`}
                            >
                              Detay
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="space-y-3 lg:hidden">
                  {result.users.map((item) => (
                    <li key={item.id} className="min-w-0 rounded-2xl border bg-card/80 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 break-all font-semibold">
                          {item.fullName || "İsim belirtilmemiş"}
                        </p>
                        <Status active={item.isActive} />
                      </div>
                      <p className="mt-1 break-all text-sm text-muted-foreground">{item.email}</p>
                      <dl className="my-3 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <dt>Kayıtlı plan</dt>
                          <dd className="mt-1 font-medium">{plan(item.subscriptionTier)}</dd>
                        </div>
                        <div>
                          <dt>Kayıt tarihi</dt>
                          <dd className="mt-1">{date(item.createdAt)}</dd>
                        </div>
                        <div>
                          <dt>Son giriş</dt>
                          <dd className="mt-1">{date(item.lastLoginAt)}</dd>
                        </div>
                      </dl>
                      <Link
                        className={linkStyle}
                        href={`/admin/users/${encodeURIComponent(item.id)}`}
                        aria-label={`${item.email} kullanıcı detayı`}
                      >
                        Detay
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <nav
              aria-label="Kullanıcı sayfaları"
              className="flex flex-wrap items-center justify-between gap-3 text-sm"
            >
              <p role="status">
                {result.pagination.total} kullanıcı · Sayfa {result.pagination.page} /{" "}
                {Math.max(1, result.pagination.totalPages)}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={query.page <= 1}
                  onClick={() => setQuery((value) => ({ ...value, page: value.page - 1 }))}
                >
                  Önceki
                </Button>
                <Button
                  variant="outline"
                  disabled={query.page >= result.pagination.totalPages}
                  onClick={() => setQuery((value) => ({ ...value, page: value.page + 1 }))}
                >
                  Sonraki
                </Button>
              </div>
            </nav>
          </>
        )
      )}
    </section>
  );
}
