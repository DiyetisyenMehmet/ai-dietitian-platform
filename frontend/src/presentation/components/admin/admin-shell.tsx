"use client";

import Link from "next/link";
import { LockKeyhole, ScrollText, ShieldCheck } from "lucide-react";

import type { AdminSession } from "@/infrastructure/admin/admin-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/presentation/components/ui/card";
import { AdminAccessManagement } from "./admin-access-management";
import { AdminAccountSecurity } from "./admin-account-security";
import { AdminAuditViewer } from "./admin-audit-viewer";

export function AdminShell({
  session,
  view = "overview",
}: {
  session: AdminSession;
  view?: "overview" | "access" | "audit";
}) {
  const environment = session.environment.environment.toUpperCase();
  const canReadAccess =
    session.permissions.includes("admin.staff.read") &&
    session.permissions.includes("admin.roles.read");
  const canManageStaff = session.permissions.includes("admin.staff.manage");
  const canManageRoles = session.permissions.includes("admin.roles.manage");
  const canReadAudit = session.permissions.includes("audit.read");

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex min-h-16 items-center justify-between gap-4 px-5 lg:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Diewish Management Center</p>
            <p className="truncate text-xs text-muted-foreground">Güvenli yönetim merkezi</p>
          </div>
          <div className="flex items-center gap-3">
            <span
              data-testid="admin-environment-banner"
              className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold tracking-[0.16em]"
            >
              {environment}
            </span>
            <div className="hidden text-right sm:block">
              <p className="max-w-56 truncate text-sm font-medium">
                {session.admin.fullName || session.admin.email}
              </p>
              <p className="max-w-56 truncate text-xs text-muted-foreground">
                {session.admin.email}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100dvh-4rem)] lg:grid-cols-[15rem_1fr]">
        <aside className="border-b border-border p-4 lg:border-b-0 lg:border-r">
          <nav aria-label="Management Center" className="space-y-2">
            <Link
              href="/admin"
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                view === "overview"
                  ? "bg-secondary font-semibold"
                  : "text-muted-foreground hover:bg-secondary/60"
              }`}
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              Overview
            </Link>

            {canReadAccess ? (
              <Link
                href="/admin/access"
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                  view === "access"
                    ? "bg-secondary font-semibold"
                    : "text-muted-foreground hover:bg-secondary/60"
                }`}
              >
                <LockKeyhole className="size-4" aria-hidden="true" />
                Access & Security
              </Link>
            ) : null}

            {canReadAudit ? (
              <Link
                href="/admin/audit"
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                  view === "audit"
                    ? "bg-secondary font-semibold"
                    : "text-muted-foreground hover:bg-secondary/60"
                }`}
              >
                <ScrollText className="size-4" aria-hidden="true" />
                İşlem Geçmişi
              </Link>
            ) : null}
          </nav>
        </aside>

        <main className="min-w-0 p-5 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            {view === "access" ? (
              <AdminAccessManagement
                currentAdminId={session.admin.id}
                canManageStaff={canManageStaff}
                canManageRoles={canManageRoles}
              />
            ) : view === "audit" ? (
              <AdminAuditViewer />
            ) : (
              <>
                <div>
                  <p className="text-sm font-medium text-primary">Management Center</p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight">Yönetim merkezi</h1>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Yönetici hesabınızı ve açılmış yönetim modüllerini buradan kontrol edebilirsiniz.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Yetki durumu</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p>
                        Roller:{" "}
                        <span className="font-medium">
                          {session.roles.join(", ") || "Atanmamış"}
                        </span>
                      </p>
                      <p>
                        İzinler:{" "}
                        <span className="font-medium">{session.permissions.length}</span>
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Ortam</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p>
                        Çalışma ortamı: <span className="font-medium">{environment}</span>
                      </p>
                      <p className="break-all text-muted-foreground">
                        Sürüm: {session.environment.commit}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <AdminAccountSecurity
                  initialEmail={session.admin.email}
                  canChangeEmail={session.roles.includes("SUPER_ADMIN")}
                />
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
