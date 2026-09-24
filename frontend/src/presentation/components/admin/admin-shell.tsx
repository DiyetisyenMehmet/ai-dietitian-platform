"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";

import type { AdminSession } from "@/infrastructure/admin/admin-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/presentation/components/ui/card";
import { PermissionGate } from "./permission-gate";

export function AdminShell({ session }: { session: AdminSession }) {
  const environment = session.environment.environment.toUpperCase();

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex min-h-16 items-center justify-between gap-4 px-5 lg:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Diewish Management Center</p>
            <p className="truncate text-xs text-muted-foreground">
              Güvenli yönetim altyapısı
            </p>
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
          <nav aria-label="Management Center">
            <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Overview
            </div>
            <PermissionGate permissions={session.permissions} require="admin.security.read">
              <div className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground">
                <LockKeyhole className="size-4" aria-hidden="true" />
                Access / Security
              </div>
            </PermissionGate>
          </nav>
        </aside>

        <main className="min-w-0 p-5 lg:p-8">
          <div className="mx-auto max-w-5xl space-y-6">
            <div>
              <p className="text-sm font-medium text-primary">Phase 1 Foundation</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">
                Yönetim merkezi hazır
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Bu yüzey yalnızca yetkilendirme, RBAC, audit ve ortam kimliği
                altyapısını gösterir. Kullanıcı veya abonelik operasyonları henüz açık değildir.
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
                    <span className="font-medium">{session.roles.join(", ") || "Atanmamış"}</span>
                  </p>
                  <p>
                    İzinler:{" "}
                    <span className="font-medium">{session.permissions.length}</span>
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Runtime kimliği</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>
                    Ortam: <span className="font-medium">{environment}</span>
                  </p>
                  <p className="break-all text-muted-foreground">
                    Commit: {session.environment.commit}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
